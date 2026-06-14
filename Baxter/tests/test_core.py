from pathlib import Path

from baxter.config import default_config
from baxter.applications import extract_application_fields, infer_salutation
from baxter.folders import natural_key, unique_path
from baxter.inbox_triage import load_inbox_triage, store_gmail_brief_as_triage
from baxter.merge_pdf import PdfMergePart, merge_pdfs
from baxter.pdf_signer import SIGNATURE_KEYWORDS


def test_natural_key_orders_numbers_like_pages():
    files = [Path("strana10.jpg"), Path("strana2.jpg"), Path("strana1.jpg")]
    ordered = sorted(files, key=natural_key)
    assert [path.name for path in ordered] == ["strana1.jpg", "strana2.jpg", "strana10.jpg"]


def test_default_config_points_to_desktop_baxter():
    config = default_config()
    assert config.base_dir.name == "Baxter"
    assert config.input_dir == config.base_dir
    assert config.done_dir.name == "Hotovo"
    assert config.error_dir.name == "Chyba"
    assert config.config_dir.name == "Config"
    assert config.signature_path.name == "signature.png"


def test_signature_keywords_keep_priority():
    assert SIGNATURE_KEYWORDS[:3] == ["Podpis klienta", "Datum a podpis", "Za klienta"]
    assert "Unterschrift" in SIGNATURE_KEYWORDS
    assert "Signature" in SIGNATURE_KEYWORDS


def test_application_extraction_from_german_advert():
    text = """
    Musikschule Zürich sucht Lehrperson Klavier
    Kontakt Frau Anna Keller
    Bewerbungen bitte an bewerbung@musikschule.example
    """
    fields = extract_application_fields(text, "Lehrperson Klavier - Musikschule Zürich", "https://example.ch/job")
    assert fields["email"] == "bewerbung@musikschule.example"
    assert fields["school_name"] == "Musikschule Zürich"
    assert fields["contact_person"] == "Frau Anna Keller"
    assert fields["salutation"] == "Sehr geehrte Frau Keller,"


def test_application_school_name_prefers_short_musikschule_city():
    text = """
    An der Musikschule Zurzach suchen wir auf das neue Schuljahr 2026
    eine Lehrperson für Cello.
    Bewerbungen bitte an info@ms-zurzach.ch
    """
    fields = extract_application_fields(text, "Lehrperson für Cello - Schweizer Musikzeitung", "https://example.ch/job")
    assert fields["school_name"] == "Musikschule Zurzach"


def test_application_salutation_falls_back_cleanly():
    assert infer_salutation("") == "Sehr geehrte Damen und Herren,"
    assert infer_salutation("Herr Max Muster") == "Sehr geehrter Herr Muster,"


def test_gmail_brief_is_stored_as_baxter_inbox_triage(tmp_path):
    triage_path = tmp_path / "inbox_triage.json"
    triage = store_gmail_brief_as_triage(
        triage_path,
        {
            "timestamp": "2026-05-30T08:00:00+02:00",
            "summary": "Daily triage ready.",
            "attentionNeeded": [
                {
                    "sender": "School Office",
                    "subject": "Meeting confirmation",
                    "nextAction": "Reply today.",
                    "url": "https://mail.google.com/mail/#all/example",
                }
            ],
            "draftsCreated": [],
            "uncertainItems": [],
            "lowPriorityActions": [],
        },
    )

    loaded = load_inbox_triage(triage_path)
    assert triage["generated_at"] == "2026-05-30T08:00:00+02:00"
    assert loaded["buckets"][0]["key"] == "urgent"
    assert loaded["buckets"][0]["items"][0]["title"] == "Meeting confirmation"
    assert loaded["buckets"][0]["items"][0]["note"] == "Reply today."


def test_merge_pdfs_preserves_part_order(tmp_path):
    import fitz

    config = _tmp_baxter_config(tmp_path)
    first = _sample_pdf(config.input_dir / "first.pdf", ["first 1", "first 2"])
    second = _sample_pdf(config.input_dir / "second.pdf", ["second 1"])

    result = merge_pdfs(
        [first, second],
        [
            PdfMergePart(file_index=1),
            PdfMergePart(file_index=0, start_page=2, end_page=2),
        ],
        config,
    )

    assert result.status == "done"
    with fitz.open(result.outputs[0]) as document:
        texts = [page.get_text() for page in document]
    assert "second 1" in texts[0]
    assert "first 2" in texts[1]


def test_merge_pdfs_can_split_and_omit_parts(tmp_path):
    import fitz

    config = _tmp_baxter_config(tmp_path)
    source = _sample_pdf(config.input_dir / "packet.pdf", ["page 1", "page 2", "page 3"])

    result = merge_pdfs(
        [source],
        [
            PdfMergePart(file_index=0, start_page=1, end_page=1),
            PdfMergePart(file_index=0, start_page=3, end_page=3),
        ],
        config,
    )

    assert result.status == "done"
    with fitz.open(result.outputs[0]) as document:
        texts = [page.get_text() for page in document]
    assert len(texts) == 2
    assert "page 1" in texts[0]
    assert "page 2" not in "\n".join(texts)
    assert "page 3" in texts[1]


def test_merge_pdfs_rejects_invalid_ranges(tmp_path):
    config = _tmp_baxter_config(tmp_path)
    source = _sample_pdf(config.input_dir / "packet.pdf", ["page 1"])

    result = merge_pdfs([source], [PdfMergePart(file_index=0, start_page=2, end_page=2)], config)

    assert result.status == "failed"
    assert "přesahuje počet stránek" in result.message


def test_merge_pdf_tool_route_and_upload_api(tmp_path, monkeypatch):
    import json
    import fitz
    from fastapi.testclient import TestClient
    import baxter.api as api

    config = _tmp_baxter_config(tmp_path)
    monkeypatch.setattr(api, "CONFIG", config)
    client = TestClient(api.app)

    page = client.get("/tools/merge-pdf")
    assert page.status_code == 200
    assert "Spojit PDF" in page.text
    assert "splitPart" in page.text
    assert "removePart" in page.text
    assert "formData.append('plan'" in page.text

    first = _sample_pdf(tmp_path / "first-upload.pdf", ["first"])
    second = _sample_pdf(tmp_path / "second-upload.pdf", ["second"])
    response = client.post(
        "/api/jobs/merge-pdf",
        data={
            "plan": json.dumps(
                {
                    "parts": [
                        {"file_index": 1},
                        {"file_index": 0},
                    ]
                }
            )
        },
        files=[
            ("files", ("first.pdf", first.read_bytes(), "application/pdf")),
            ("files", ("second.pdf", second.read_bytes(), "application/pdf")),
        ],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "done"
    assert payload["output_urls"]
    with fitz.open(payload["outputs"][0]) as document:
        texts = [page.get_text() for page in document]
    assert "second" in texts[0]
    assert "first" in texts[1]


def _tmp_baxter_config(tmp_path):
    from baxter.config import BaxterConfig

    base = tmp_path / "Baxter"
    input_dir = base
    done_dir = base / "Hotovo"
    error_dir = base / "Chyba"
    config_dir = base / "Config"
    for folder in (input_dir, done_dir, error_dir, config_dir):
        folder.mkdir(parents=True, exist_ok=True)
    return BaxterConfig(
        base_dir=base,
        input_dir=input_dir,
        done_dir=done_dir,
        error_dir=error_dir,
        config_dir=config_dir,
        signature_path=config_dir / "signature.png",
    )


def _sample_pdf(path, page_texts):
    import fitz

    document = fitz.open()
    try:
        for text in page_texts:
            page = document.new_page()
            page.insert_text((72, 72), text)
        document.save(path)
    finally:
        document.close()
    return path
