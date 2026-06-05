from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image

from .config import BaxterConfig, CONFIG, POINTS_PER_MM, resolve_signature_path
from .folders import list_files_by_suffix, move_many_to_done, unique_path, validate_folders
from .jobs import manual_sign_jobs
from .models import JobResult, ManualSignJob


PDF_SUFFIXES = {".pdf"}
SIGNATURE_KEYWORDS = [
    "Podpis klienta",
    "Datum a podpis",
    "Za klienta",
    "Podpis",
    "Unterschrift",
    "Signature",
    "Signatur",
]


@dataclass(frozen=True)
class SignatureTarget:
    page_index: int
    rect: fitz.Rect
    keyword: str


def signature_exists(config: BaxterConfig = CONFIG) -> bool:
    return resolve_signature_path(config).is_file()


def validate_signature(config: BaxterConfig = CONFIG) -> JobResult | None:
    if signature_exists(config):
        return None
    return JobResult(
        status="missing_config",
        message="Chybí podpisový obrázek signature.png ve složce Config.",
        details={"signature_path": str(config.signature_path)},
    )


def signature_rect_for_width(
    signature_path: Path,
    width_mm: float,
    center_x: float,
    center_y: float,
) -> fitz.Rect:
    with Image.open(signature_path) as image:
        width_px, height_px = image.size
    width_pts = width_mm * POINTS_PER_MM
    height_pts = width_pts * (height_px / width_px)
    return fitz.Rect(
        center_x - width_pts / 2,
        center_y - height_pts / 2,
        center_x + width_pts / 2,
        center_y + height_pts / 2,
    )


def clamp_rect_to_page(rect: fitz.Rect, page_rect: fitz.Rect) -> fitz.Rect:
    dx = 0.0
    dy = 0.0
    if rect.x0 < page_rect.x0:
        dx = page_rect.x0 - rect.x0
    elif rect.x1 > page_rect.x1:
        dx = page_rect.x1 - rect.x1
    if rect.y0 < page_rect.y0:
        dy = page_rect.y0 - rect.y0
    elif rect.y1 > page_rect.y1:
        dy = page_rect.y1 - rect.y1
    return rect + (dx, dy, dx, dy)


def find_signature_target(document: fitz.Document) -> SignatureTarget | None:
    if document.page_count == 0:
        return None

    page_order = list(range(document.page_count - 1, -1, -1))
    for page_index in page_order:
        page = document[page_index]
        for keyword in SIGNATURE_KEYWORDS:
            matches = page.search_for(keyword)
            if matches:
                return SignatureTarget(page_index=page_index, rect=matches[0], keyword=keyword)
    return None


def insert_signature_at_center(
    pdf_path: Path,
    output_path: Path,
    page_index: int,
    center_x: float,
    center_y: float,
    width_mm: float,
    config: BaxterConfig = CONFIG,
) -> None:
    document = fitz.open(pdf_path)
    try:
        page = document[page_index]
        signature_path = resolve_signature_path(config)
        rect = signature_rect_for_width(signature_path, width_mm, center_x, center_y)
        rect = clamp_rect_to_page(rect, page.rect)
        page.insert_image(rect, filename=str(signature_path), overlay=True)
        document.save(output_path, garbage=4, deflate=True)
    finally:
        document.close()


def sign_pdf_automatically(pdf_path: Path, config: BaxterConfig = CONFIG) -> tuple[Path | None, SignatureTarget | None]:
    output_path = unique_path(config.input_dir / f"{pdf_path.stem}_signed.pdf")
    document = fitz.open(pdf_path)
    try:
        target = find_signature_target(document)
        if target is None:
            return None, None
        page = document[target.page_index]
        offset = config.signature_auto_offset_up_mm * POINTS_PER_MM
        width_mm = config.signature_width_mm
        center_x = target.rect.x0 + (width_mm * POINTS_PER_MM / 2)
        signature_path = resolve_signature_path(config)
        rect = signature_rect_for_width(
            signature_path,
            width_mm,
            center_x,
            target.rect.y0,
        )
        center_y = target.rect.y0 - offset - rect.height / 2
        signature_rect = signature_rect_for_width(
            signature_path,
            width_mm,
            center_x,
            center_y,
        )
        signature_rect = clamp_rect_to_page(signature_rect, page.rect)
        page.insert_image(signature_rect, filename=str(signature_path), overlay=True)
        document.save(output_path, garbage=4, deflate=True)
        return output_path, target
    finally:
        document.close()


def sign_pdfs(config: BaxterConfig = CONFIG, base_url: str = "http://127.0.0.1:8765") -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error
    signature_error = validate_signature(config)
    if signature_error:
        return signature_error

    pdfs = list_files_by_suffix(config.input_dir, PDF_SUFFIXES)
    if not pdfs:
        return JobResult(status="failed", message="Ve složce Baxter nejsou žádná PDF.")

    completed_inputs: list[Path] = []
    completed_outputs: list[Path] = []
    targets: list[dict[str, object]] = []

    for pdf in pdfs:
        try:
            output, target = sign_pdf_automatically(pdf, config)
        except Exception as exc:
            return JobResult(
                status="failed",
                message=f"Podepsání PDF selhalo u souboru {pdf.name}: {exc}",
            )

        if output is None:
            job = ManualSignJob(source_pdf=pdf)
            with fitz.open(pdf) as document:
                job.page_index = max(document.page_count - 1, 0)
            manual_sign_jobs[job.job_id] = job
            moved = move_many_to_done([*completed_inputs, *completed_outputs], config)
            outputs = [str(path) for path in moved[len(completed_inputs):]]
            return JobResult(
                status="needs_input",
                message="Nenašel jsem místo pro podpis. Je potřeba ruční umístění.",
                outputs=outputs,
                manual_url=f"{base_url}/manual-sign/{job.job_id}",
                details={"job_id": job.job_id, "pdf": str(pdf)},
            )

        completed_inputs.append(pdf)
        completed_outputs.append(output)
        if target:
            targets.append(
                {
                    "pdf": pdf.name,
                    "page": target.page_index + 1,
                    "keyword": target.keyword,
                }
            )

    moved = move_many_to_done([*completed_inputs, *completed_outputs], config)
    outputs = [str(path) for path in moved[len(completed_inputs):]]
    return JobResult(
        status="done",
        message="PDF bylo podepsáno.",
        outputs=outputs,
        details={"processed": len(outputs), "targets": targets},
    )


def start_manual_signing(config: BaxterConfig = CONFIG, base_url: str = "http://127.0.0.1:8765", filename: str | None = None) -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error
    signature_error = validate_signature(config)
    if signature_error:
        return signature_error

    if filename is not None:
        pdf = (config.input_dir / filename).resolve()
        try:
            pdf.relative_to(config.input_dir.resolve())
        except ValueError:
            return JobResult(status="failed", message="Soubor není ve složce Inbox.")
        if not pdf.is_file():
            return JobResult(status="failed", message=f"Soubor neexistuje: {pdf.name}")
        pdfs = [pdf]
    else:
        pdfs = list_files_by_suffix(config.input_dir, PDF_SUFFIXES)

    if not pdfs:
        return JobResult(status="failed", message="Ve složce Baxter nejsou žádná PDF k podepsání.")

    pdf = pdfs[0]
    try:
        with fitz.open(pdf) as document:
            page_index = max(document.page_count - 1, 0)
    except Exception as exc:
        return JobResult(status="failed", message=f"PDF nelze otevřít: {pdf.name}. {exc}")

    job = ManualSignJob(source_pdf=pdf, page_index=page_index)
    manual_sign_jobs[job.job_id] = job
    return JobResult(
        status="needs_input",
        message="Otevřel jsem PDF pro ruční umístění podpisu.",
        manual_url=f"{base_url}/manual-sign/{job.job_id}",
        details={"job_id": job.job_id, "pdf": str(pdf), "pdf_count": len(pdfs)},
    )


def complete_manual_signature(
    job_id: str,
    page_index: int,
    center_x: float,
    center_y: float,
    width_mm: float,
    config: BaxterConfig = CONFIG,
) -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error
    signature_error = validate_signature(config)
    if signature_error:
        return signature_error

    job = manual_sign_jobs.get(job_id)
    if job is None:
        return JobResult(status="failed", message="Ruční podpisová úloha už neexistuje.")
    if not job.source_pdf.exists():
        return JobResult(status="failed", message="PDF pro ruční podpis už není ve složce Baxter.")

    output = unique_path(config.input_dir / f"{job.source_pdf.stem}_signed.pdf")
    try:
        insert_signature_at_center(
            pdf_path=job.source_pdf,
            output_path=output,
            page_index=page_index,
            center_x=center_x,
            center_y=center_y,
            width_mm=width_mm,
            config=config,
        )
    except Exception as exc:
        return JobResult(status="failed", message=f"Ruční podepsání PDF selhalo: {exc}")

    moved = move_many_to_done([job.source_pdf, output], config)
    manual_sign_jobs.pop(job_id, None)
    outputs = [str(path) for path in moved[1:]]
    return JobResult(status="done", message="PDF bylo ručně podepsáno.", outputs=outputs)
