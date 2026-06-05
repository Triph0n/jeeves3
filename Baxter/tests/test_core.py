from pathlib import Path

from baxter.config import default_config
from baxter.applications import extract_application_fields, infer_salutation
from baxter.folders import natural_key, unique_path
from baxter.inbox_triage import load_inbox_triage, store_gmail_brief_as_triage
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
