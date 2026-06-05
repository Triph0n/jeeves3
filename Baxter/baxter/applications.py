from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from email.utils import parseaddr
from html.parser import HTMLParser
import html
import json
import re
import textwrap
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4
import shutil
import win32com.client
import pythoncom

import fitz

from .config import BaxterConfig, CONFIG
from .folders import unique_path
from .models import JobResult


APPLICATIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "applications.json"
LETTER_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "cover_letter_de.txt"
EMAIL_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "application_email_de.txt"
GMAIL_DRAFTS_URL = "https://mail.google.com/mail/u/0/#drafts"
GMAIL_COMPOSE_URL = "https://mail.google.com/mail/u/0/?view=cm&fs=1"


@dataclass
class ApplicationRecord:
    id: str
    created_at: str
    source_url: str
    status: str
    message: str
    school_name: str = ""
    job_title: str = ""
    contact_person: str = ""
    salutation: str = "Sehr geehrte Damen und Herren,"
    email: str = ""
    subject: str = ""
    pdf_path: str = ""
    draft_path: str = ""
    draft_url: str = GMAIL_DRAFTS_URL
    compose_url: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip = 0
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag in {"p", "br", "li", "div", "section", "article", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self.skip:
            self.skip -= 1
        if tag == "title":
            self.in_title = False
        if tag in {"p", "li", "div", "section", "article", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        if self.in_title:
            self.title_parts.append(cleaned)
        self.parts.append(cleaned)
        self.parts.append(" ")

    @property
    def text(self) -> str:
        compact = re.sub(r"[ \t]+", " ", "".join(self.parts))
        compact = re.sub(r"\n\s*\n+", "\n", compact)
        return html.unescape(compact).strip()

    @property
    def title(self) -> str:
        return html.unescape(" ".join(self.title_parts)).strip()


def load_applications() -> list[dict[str, Any]]:
    if not APPLICATIONS_PATH.is_file():
        return []
    try:
        data = json.loads(APPLICATIONS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def recent_applications(limit: int = 8) -> list[dict[str, Any]]:
    return sorted(load_applications(), key=lambda item: item.get("created_at", ""), reverse=True)[:limit]


def save_application(record: ApplicationRecord) -> None:
    APPLICATIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = [item for item in load_applications() if item.get("id") != record.id]
    records.append(record.to_dict())
    records = sorted(records, key=lambda item: item.get("created_at", ""), reverse=True)[:50]
    APPLICATIONS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def get_application(application_id: str) -> dict[str, Any] | None:
    for record in load_applications():
        if record.get("id") == application_id:
            return record
    return None


def discard_application(application_id: str) -> bool:
    records = load_applications()
    kept = [item for item in records if item.get("id") != application_id]
    if len(kept) == len(records):
        return False
    APPLICATIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    APPLICATIONS_PATH.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def prepare_application_from_url(url: str, config: BaxterConfig = CONFIG) -> JobResult:
    normalized_url = url.strip()
    if not normalized_url:
        return JobResult(status="failed", message="Chybí URL inzerátu.")
    parsed = urlparse(normalized_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return JobResult(status="failed", message="URL musí začínat http:// nebo https://.")

    config.done_dir.mkdir(parents=True, exist_ok=True)
    concepts_dir(config).mkdir(parents=True, exist_ok=True)

    try:
        page = fetch_advert(normalized_url)
        extracted = extract_application_fields(page["text"], page["title"], normalized_url)
        pdf_path = build_application_pdf(extracted, config)
        draft_path, subject, compose_url = build_email_draft(extracted, pdf_path, config)
    except Exception as exc:
        record = ApplicationRecord(
            id=uuid4().hex,
            created_at=datetime.now().isoformat(timespec="seconds"),
            source_url=normalized_url,
            status="failed",
            message=f"Zpracování inzerátu selhalo: {exc}",
        )
        save_application(record)
        return JobResult(status="failed", message=record.message, details={"application_id": record.id})

    missing = []
    if not extracted["email"]:
        missing.append("email")
    if not extracted["school_name"]:
        missing.append("jméno školy")

    status = "needs_input" if missing else "done"
    message = "Připravil jsem PDF a emailový koncept."
    if missing:
        message += " Zkontroluj prosím chybějící pole: " + ", ".join(missing) + "."

    record = ApplicationRecord(
        id=uuid4().hex,
        created_at=datetime.now().isoformat(timespec="seconds"),
        source_url=normalized_url,
        status=status,
        message=message,
        school_name=extracted["school_name"],
        job_title=extracted["job_title"],
        contact_person=extracted["contact_person"],
        salutation=extracted["salutation"],
        email=extracted["email"],
        subject=subject,
        pdf_path=str(pdf_path),
        draft_path=str(draft_path),
        draft_url=GMAIL_DRAFTS_URL,
        compose_url=compose_url,
        details={
            "materials_pdf": extracted.get("materials_pdf", ""),
            "source_title": page["title"],
            "missing": missing,
        },
    )
    save_application(record)
    return JobResult(
        status=status,
        message=message,
        outputs=[str(pdf_path), str(draft_path)],
        details=record.to_dict(),
    )


def fetch_advert(url: str) -> dict[str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "Baxter/0.1 (+local application assistant)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
    )
    with urlopen(request, timeout=20) as response:
        raw = response.read(2_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
    body = raw.decode(charset, errors="replace")
    parser = TextExtractor()
    parser.feed(body)
    return {"title": parser.title, "text": parser.text}


def extract_application_fields(text: str, title: str, source_url: str) -> dict[str, str]:
    lines = [line.strip(" -|\t") for line in text.splitlines() if line.strip()]
    email = first_email(text)
    job_title = infer_job_title(lines, title)
    school_name = infer_school_name(lines, title, source_url)
    contact_person = infer_contact_person(lines)
    salutation = infer_salutation(contact_person)
    return {
        "source_url": source_url,
        "source_title": title,
        "email": email,
        "job_title": job_title,
        "school_name": school_name,
        "contact_person": contact_person,
        "salutation": salutation,
    }


def first_email(text: str) -> str:
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.IGNORECASE)
    return parseaddr(match.group(0))[1] if match else ""


def infer_job_title(lines: list[str], title: str) -> str:
    candidates = [title, *lines[:12]]
    for line in candidates:
        if re.search(r"(musik|klavier|gesang|lehr|dozent|stelle|bewerb|pädagog)", line, re.IGNORECASE):
            return clean_label(line)
    return clean_label(title) or "Musiklehrperson"


def infer_school_name(lines: list[str], title: str, source_url: str) -> str:
    source = "\n".join([title, *lines[:120]])
    musikschule_match = re.search(
        r"\b(Musikschule\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+)\b",
        source,
    )
    if musikschule_match:
        return clean_label(musikschule_match.group(1))

    patterns = [
        r"(Musikschule\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2})",
        r"([A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2}\s+Musikschule)",
        r"([A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2}\s+Schule)",
        r"([A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2}\s+Hochschule)",
        r"(Kantonsschule\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, source)
        if match:
            return clean_label(match.group(1))
    title_parts = re.split(r"\s+[|-]\s+|:", title)
    for part in title_parts:
        if re.search(r"(schule|musik)", part, re.IGNORECASE):
            return clean_label(part)
    domain = urlparse(source_url).netloc.replace("www.", "")
    return domain.split(".")[0].replace("-", " ").title()


def infer_contact_person(lines: list[str]) -> str:
    patterns = [
        r"(Frau\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2})",
        r"(Herr\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){0,2})",
        r"(?:Kontakt|Auskunft|Ansprechperson|Kontaktperson)[:\s]+([A-ZÄÖÜ][\wÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'-]+){1,2})",
    ]
    for line in lines[:120]:
        for pattern in patterns:
            match = re.search(pattern, line)
            if match:
                return clean_label(match.group(1))
    return ""


def infer_salutation(contact_person: str) -> str:
    if not contact_person:
        return "Sehr geehrte Damen und Herren,"
    parts = contact_person.split()
    if parts[0].casefold() == "frau" and len(parts) >= 2:
        return f"Sehr geehrte Frau {parts[-1]},"
    if parts[0].casefold() == "herr" and len(parts) >= 2:
        return f"Sehr geehrter Herr {parts[-1]},"
    return f"Guten Tag {contact_person},"


def clean_label(value: str) -> str:
    value = re.sub(r"\s+", " ", html.unescape(value)).strip(" -|,.;")
    return value[:180]


def build_word_pdf(template_path: Path, output_pdf: Path, fields: dict[str, str]) -> bool:
    temp_odt = output_pdf.with_name(f"temp_{output_pdf.stem}.odt")
    try:
        shutil.copy2(template_path, temp_odt)
        pythoncom.CoInitialize()
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = False
        
        doc = word.Documents.Open(str(temp_odt.resolve()))
        
        def replace_text(find_str, replace_str):
            if not replace_str:
                replace_str = ""
            word.Selection.Find.ClearFormatting()
            word.Selection.Find.Replacement.ClearFormatting()
            word.Selection.Find.Execute(find_str, False, False, False, False, False, True, 1, False, replace_str, 2)
            
        replace_text("{{ school_name }}", fields.get("school_name", ""))
        replace_text("{{ job_title }}", fields.get("job_title", ""))
        replace_text("{{ salutation }}", fields.get("salutation", ""))
        replace_text("{{ contact_person }}", fields.get("contact_person", ""))
        
        doc.ExportAsFixedFormat(str(output_pdf.resolve()), 17)
        doc.Close(False)
        word.Quit()
        return True
    except Exception as e:
        print(f"Word PDF generation error: {e}")
        return False
    finally:
        try:
            temp_odt.unlink()
        except OSError:
            pass

def build_application_pdf(fields: dict[str, str], config: BaxterConfig) -> Path:
    school_slug = slug(fields.get("school_name") or "schule")
    output = unique_path(config.done_dir / f"Bewerbung_{school_slug}_{datetime.now():%Y%m%d}.pdf")
    cover_pdf = output.with_name(f"{output.stem}_Anschreiben.pdf")
    
    odt_template = Path(__file__).resolve().parent.parent / "templates" / "cover_letter.odt"
    pdf_generated = False
    if odt_template.is_file():
        pdf_generated = build_word_pdf(odt_template, cover_pdf, fields)
        
    if not pdf_generated:
        rendered_letter = render_template(LETTER_TEMPLATE_PATH, fields, default_cover_letter())
        write_text_pdf(cover_pdf, rendered_letter)

    materials_pdf = find_materials_pdf(config)
    if materials_pdf:
        merge_pdfs([cover_pdf, materials_pdf], output)
        try:
            cover_pdf.unlink()
        except OSError:
            pass
        fields["materials_pdf"] = str(materials_pdf)
    else:
        cover_pdf.rename(output)
        fields["materials_pdf"] = ""
    return output


def build_email_draft(fields: dict[str, str], pdf_path: Path, config: BaxterConfig) -> tuple[Path, str, str]:
    subject = f"Bewerbung als {fields.get('job_title') or 'Musiklehrperson'}"
    if fields.get("school_name"):
        subject += f" - {fields['school_name']}"
    draft_fields = {
        **fields,
        "subject": subject,
        "attachment_name": pdf_path.name,
        "attachment_path": str(pdf_path),
    }
    body = render_template(EMAIL_TEMPLATE_PATH, draft_fields, default_email_template())
    draft = unique_path(concepts_dir(config) / f"{slug(fields.get('school_name') or 'bewerbung')}_{datetime.now():%Y%m%d_%H%M}.txt")
    draft.write_text(
        "\n".join(
            [
                f"To: {fields.get('email', '')}",
                f"Subject: {subject}",
                f"Attachment: {pdf_path}",
                "",
                body,
                "",
                f"Source: {fields.get('source_url', '')}",
            ]
        ),
        encoding="utf-8",
    )
    compose_url = build_gmail_compose_url(fields.get("email", ""), subject, body)
    return draft, subject, compose_url


def render_template(path: Path, fields: dict[str, str], fallback: str) -> str:
    template = path.read_text(encoding="utf-8") if path.is_file() else fallback
    rendered = template
    for key, value in fields.items():
        rendered = rendered.replace("{{ " + key + " }}", value or "")
        rendered = rendered.replace("{{" + key + "}}", value or "")
    return rendered


def write_text_pdf(path: Path, text: str) -> None:
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    left, top, right, bottom = 72, 72, 72, 72
    y = top
    line_height = 14
    font_size = 11
    max_chars = 86
    for paragraph in text.splitlines():
        wrapped = textwrap.wrap(paragraph, width=max_chars) if paragraph.strip() else [""]
        for line in wrapped:
            if y > page.rect.height - bottom:
                page = document.new_page(width=595, height=842)
                y = top
            page.insert_text((left, y), line, fontsize=font_size, fontname="helv")
            y += line_height
        y += 4
    document.save(path)
    document.close()


def merge_pdfs(paths: list[Path], output: Path) -> None:
    merged = fitz.open()
    for path in paths:
        with fitz.open(path) as source:
            merged.insert_pdf(source)
    merged.save(output)
    merged.close()


def find_materials_pdf(config: BaxterConfig) -> Path | None:
    preferred = [
        "bewerbungsunterlagen.pdf",
        "bewerbung_materialien.pdf",
        "application_materials.pdf",
        "materialien.pdf",
    ]
    if config.config_dir.is_dir():
        by_name = {path.name.casefold(): path for path in config.config_dir.glob("*.pdf")}
        for name in preferred:
            if name in by_name:
                return by_name[name]
        candidates = sorted(config.config_dir.glob("*.pdf"), key=lambda path: path.name.casefold())
        if candidates:
            return candidates[0]
    return None


def concepts_dir(config: BaxterConfig = CONFIG) -> Path:
    return config.base_dir / "Koncepty"


def build_gmail_compose_url(email: str, subject: str, body: str) -> str:
    params = [
        ("to", email),
        ("su", subject),
        ("body", body),
    ]
    query = "&".join(f"{key}={quote_plus(value)}" for key, value in params if value)
    return f"{GMAIL_COMPOSE_URL}&{query}" if query else GMAIL_COMPOSE_URL


def slug(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9ÄÖÜäöüß]+", "_", value).strip("_")
    return normalized[:60] or "bewerbung"


def default_cover_letter() -> str:
    return """{{ salutation }}

hiermit bewerbe ich mich auf die ausgeschriebene Stelle {{ job_title }} an der {{ school_name }}.

Die Verbindung von musikalischer Qualität, pädagogischer Klarheit und einer sorgfältigen Arbeit mit Schülerinnen und Schülern ist mir besonders wichtig. Gerne bringe ich meine Erfahrung, Zuverlässigkeit und Begeisterung für den Musikunterricht in Ihr Team ein.

Über die Möglichkeit, mich persönlich vorzustellen, freue ich mich sehr.

Mit freundlichen Grüssen

Vladimir
"""


def default_email_template() -> str:
    return """{{ salutation }}

anbei sende ich Ihnen meine Bewerbungsunterlagen für die ausgeschriebene Stelle {{ job_title }} an der {{ school_name }}.

Ich freue mich über Ihre Rückmeldung und stehe für Rückfragen gerne zur Verfügung.

Mit freundlichen Grüssen
Vladimir
"""
