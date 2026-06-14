from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz

from .config import BaxterConfig, CONFIG
from .folders import move_many_to_done, unique_path, validate_folders
from .models import JobResult


PDF_SUFFIXES = {".pdf"}


@dataclass(frozen=True)
class PdfMergePart:
    file_index: int
    start_page: int | None = None
    end_page: int | None = None


def parse_merge_parts(payload: Any) -> list[PdfMergePart]:
    raw_parts = payload.get("parts") if isinstance(payload, dict) else payload
    if not isinstance(raw_parts, list):
        raise ValueError("Plán spojení PDF nemá seznam částí.")

    parts: list[PdfMergePart] = []
    for index, raw_part in enumerate(raw_parts, start=1):
        if not isinstance(raw_part, dict):
            raise ValueError(f"Část {index} nemá platný formát.")
        try:
            file_index = int(raw_part["file_index"])
        except (KeyError, TypeError, ValueError):
            raise ValueError(f"Část {index} nemá platný zdrojový soubor.") from None

        start_page = _optional_positive_int(raw_part.get("start_page"), f"Část {index}: začátek")
        end_page = _optional_positive_int(raw_part.get("end_page"), f"Část {index}: konec")
        parts.append(PdfMergePart(file_index=file_index, start_page=start_page, end_page=end_page))
    return parts


def merge_pdfs(
    source_paths: list[Path],
    parts: list[PdfMergePart] | None = None,
    config: BaxterConfig = CONFIG,
    output_name: str | None = None,
) -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error
    if not source_paths:
        return JobResult(status="failed", message="Nebyly vybrány žádné PDF soubory.")

    resolved_sources = [_resolve_input_pdf(path, config) for path in source_paths]
    for source in resolved_sources:
        if source is None:
            return JobResult(status="failed", message="Soubor není platné PDF ve složce Baxter.")

    if parts is None:
        parts = [PdfMergePart(file_index=index) for index in range(len(resolved_sources))]
    if not parts:
        return JobResult(status="failed", message="Nezůstala žádná část PDF ke spojení.")

    documents: list[fitz.Document] = []
    output_document = fitz.open()
    try:
        for source in resolved_sources:
            try:
                documents.append(fitz.open(source))
            except Exception as exc:
                return JobResult(status="failed", message=f"PDF nelze otevřít: {source.name}. {exc}")

        for position, part in enumerate(parts, start=1):
            if part.file_index < 0 or part.file_index >= len(documents):
                return JobResult(status="failed", message=f"Část {position} odkazuje na neznámý PDF soubor.")

            source_doc = documents[part.file_index]
            page_count = source_doc.page_count
            if page_count == 0:
                return JobResult(status="failed", message=f"PDF nemá žádné stránky: {resolved_sources[part.file_index].name}")

            start_page = part.start_page or 1
            end_page = part.end_page or page_count
            if start_page < 1 or end_page < 1:
                return JobResult(status="failed", message=f"Část {position} má neplatný rozsah stránek.")
            if start_page > end_page:
                return JobResult(status="failed", message=f"Část {position} má obrácený rozsah stránek.")
            if end_page > page_count:
                return JobResult(
                    status="failed",
                    message=f"Část {position} přesahuje počet stránek v souboru {resolved_sources[part.file_index].name}.",
                )

            output_document.insert_pdf(source_doc, from_page=start_page - 1, to_page=end_page - 1)

        if output_document.page_count == 0:
            return JobResult(status="failed", message="Výsledné PDF by bylo prázdné.")

        base_name = _safe_output_name(output_name) or f"{resolved_sources[0].stem}_merged.pdf"
        output_path = unique_path(config.input_dir / base_name)
        output_document.save(output_path, garbage=4, deflate=True)
    except Exception as exc:
        return JobResult(status="failed", message=f"Spojení PDF selhalo: {exc}")
    finally:
        output_document.close()
        for document in documents:
            document.close()

    moved_inputs = _unique_paths(resolved_sources)
    moved = move_many_to_done([*moved_inputs, output_path], config)
    outputs = [str(path) for path in moved if path.name == output_path.name or path.suffix.casefold() == ".pdf"][-1:]
    return JobResult(
        status="done",
        message="PDF soubory byly spojeny.",
        outputs=outputs,
        details={"processed": len(parts), "sources": len(resolved_sources)},
    )


def _optional_positive_int(value: Any, label: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} není číslo.") from None
    if number < 1:
        raise ValueError(f"{label} musí být alespoň 1.")
    return number


def _resolve_input_pdf(path: Path, config: BaxterConfig) -> Path | None:
    resolved = path.resolve()
    try:
        resolved.relative_to(config.input_dir.resolve())
    except ValueError:
        return None
    if not resolved.is_file() or resolved.suffix.casefold() not in PDF_SUFFIXES:
        return None
    return resolved


def _safe_output_name(name: str | None) -> str | None:
    if not name:
        return None
    candidate = Path(name).name.strip()
    if not candidate:
        return None
    if Path(candidate).suffix.casefold() != ".pdf":
        candidate = f"{Path(candidate).stem}.pdf"
    return candidate


def _unique_paths(paths: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(path)
    return unique
