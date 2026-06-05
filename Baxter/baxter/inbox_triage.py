from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _brief_items(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _summary_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        parts = [
            _clean_text(value.get("sender") or value.get("from")),
            _clean_text(value.get("subject") or value.get("title")),
            _clean_text(value.get("summary") or value.get("reason") or value.get("why") or value.get("body") or value.get("nextAction") or value.get("next_action")),
        ]
        return ": ".join(part for part in parts if part)
    if isinstance(value, list):
        rows: list[str] = []
        for item in _brief_items(value):
            parts = [
                _clean_text(item.get("sender") or item.get("from")),
                _clean_text(item.get("subject") or item.get("title")),
                _clean_text(item.get("summary") or item.get("reason") or item.get("why") or item.get("body") or item.get("nextAction") or item.get("next_action")),
            ]
            line = ": ".join(part for part in parts if part)
            if line:
                rows.append(line)
        return " | ".join(rows)
    return _clean_text(value)


def _triage_item(item: dict[str, Any], fallback_date: str) -> dict[str, str]:
    title = _clean_text(item.get("subject") or item.get("title")) or "Bez predmetu"
    note = _clean_text(item.get("nextAction") or item.get("next_action") or item.get("summary") or item.get("reason"))
    action = _clean_text(item.get("nextAction") or item.get("next_action") or item.get("action"))
    summary = _clean_text(item.get("summary") or item.get("reason") or item.get("why") or item.get("body"))
    audit = _clean_text(item.get("audit") or item.get("auditNote") or item.get("audit_note") or item.get("status"))
    bucket = _clean_text(item.get("bucket") or item.get("category"))
    return {
        "title": title,
        "sender": _clean_text(item.get("sender") or item.get("from")) or "Neznamy odesilatel",
        "date": _clean_text(item.get("date")) or fallback_date,
        "note": note or "Zkontrolovat a rozhodnout dalsi krok.",
        "url": _clean_text(item.get("url") or item.get("display_url")),
        "action": action,
        "summary": summary,
        "bucket": bucket,
        "audit": audit,
    }


def _bucket(key: str, title: str, items: list[dict[str, Any]], fallback_date: str) -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "items": [_triage_item(item, fallback_date) for item in items],
    }


def gmail_brief_to_inbox_triage(payload: dict[str, Any]) -> dict[str, Any]:
    timestamp = _clean_text(payload.get("timestamp") or payload.get("runTimestamp") or payload.get("run_timestamp"))
    fallback_date = timestamp[:10] if len(timestamp) >= 10 else ""
    summary = _summary_text(payload.get("summary") or payload.get("finalOutput") or payload.get("final_output"))
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    buckets = [
        _bucket("urgent", "Needs Attention", _brief_items(payload.get("attentionNeeded") or payload.get("attention_needed")), fallback_date),
        _bucket("needs_reply", "Drafts Ready", _brief_items(payload.get("draftsCreated") or payload.get("drafts_created")), fallback_date),
        _bucket("waiting", "Follow-ups / Uncertain", _brief_items(payload.get("uncertainItems") or payload.get("uncertain_items")), fallback_date),
        _bucket("fyi", "Low Priority / Filed", _brief_items(payload.get("lowPriorityActions") or payload.get("low_priority_actions")), fallback_date),
    ]
    follow_ups = payload.get("nextFollowUps") or payload.get("next_follow_ups")
    if isinstance(follow_ups, list) and follow_ups:
        follow_up_items = _brief_items(follow_ups)
        buckets.insert(
            2,
            _bucket("follow_up", "Next Follow-ups", follow_up_items, fallback_date)
            if follow_up_items
            else {
                "key": "follow_up",
                "title": "Next Follow-ups",
                "items": [
                    {
                        "title": "Follow-up",
                        "sender": "Baxter",
                        "date": fallback_date,
                        "note": _clean_text(item),
                        "url": "",
                    }
                    for item in follow_ups
                    if _clean_text(item)
                ],
            },
        )
    return {
        "generated_at": timestamp or None,
        "summary": summary or "Daily Gmail triage imported for Baxter.",
        "source": _clean_text(payload.get("source")) or "gmail-attention-brief",
        "counts": {
            "scanned": int(counts.get("scanned") or payload.get("scanned") or 0),
            "attention_needed": int(counts.get("attentionNeeded") or counts.get("attention_needed") or 0),
            "drafts_created": int(counts.get("draftsCreated") or counts.get("drafts_created") or 0),
            "low_priority_actions": int(counts.get("lowPriorityActions") or counts.get("low_priority_actions") or 0),
            "uncertain_items": int(counts.get("uncertainItems") or counts.get("uncertain_items") or 0),
        },
        "buckets": buckets,
    }


def store_gmail_brief_as_triage(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    triage = gmail_brief_to_inbox_triage(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(triage, ensure_ascii=False, indent=2), encoding="utf-8")
    return triage


def load_inbox_triage(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {
            "generated_at": None,
            "summary": "Zatim neni ulozena zadna inbox triage.",
            "buckets": [],
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "generated_at": None,
            "summary": f"Inbox triage se nepodarilo nacist: {exc}",
            "buckets": [],
        }
    if not isinstance(payload, dict):
        return {"generated_at": None, "summary": "Inbox triage ma neplatny format.", "buckets": []}
    buckets = payload.get("buckets")
    if not isinstance(buckets, list):
        payload["buckets"] = []
    return payload
