from __future__ import annotations

import json
from pathlib import Path
import os
from urllib.parse import quote

import fitz
import shutil
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.responses import FileResponse

from . import __version__
from .config import CONFIG, resolve_signature_path
from .folders import folder_status, list_files_by_suffix, unique_path, validate_folders
from .image_to_pdf import IMAGE_SUFFIXES, convert_images_to_pdf
from .inbox_triage import load_inbox_triage, store_gmail_brief_as_triage
from .jobs import manual_sign_jobs
from .merge_pdf import PDF_SUFFIXES as MERGE_PDF_SUFFIXES, merge_pdfs, parse_merge_parts
from .models import JobResult
from .applications import discard_application, get_application, prepare_application_from_url, recent_applications
from .pdf_signer import PDF_SUFFIXES, complete_manual_signature, signature_exists, start_manual_signing
from .video_to_audio import VIDEO_SUFFIXES, convert_videos_to_mp3


app = FastAPI(title="Baxter", version=__version__)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "static"), name="static")
templates = Jinja2Templates(directory=str(PROJECT_ROOT / "templates"))
INBOX_TRIAGE_PATH = PROJECT_ROOT / "data" / "inbox_triage.json"
GMAIL_LOW_PRIORITY_SENDERS_PATH = PROJECT_ROOT / "data" / "gmail_low_priority_senders.json"


class ManualSignaturePayload(BaseModel):
    page_index: int
    center_x: float
    center_y: float
    width_mm: float


class ApplicationUrlPayload(BaseModel):
    url: str


class FileListPayload(BaseModel):
    filenames: list[str]


def json_result(result: JobResult) -> JSONResponse:
    return JSONResponse(result.to_dict())


def done_file_url(path: str) -> str | None:
    file_path = Path(path)
    try:
        file_path.resolve().relative_to(CONFIG.done_dir.resolve())
    except ValueError:
        return None
    return f"/api/done/{quote(file_path.name)}"


def application_output_url(path: str, kind: str) -> str | None:
    if kind not in {"pdf", "draft"}:
        return None
    file_path = Path(path)
    folder = CONFIG.done_dir if kind == "pdf" else CONFIG.base_dir / "Koncepty"
    try:
        file_path.resolve().relative_to(folder.resolve())
    except ValueError:
        return None
    return f"/api/applications/file/{kind}/{quote(file_path.name)}"


def enrich_outputs_with_urls(payload: dict[str, object]) -> dict[str, object]:
    outputs = payload.get("outputs")
    if not isinstance(outputs, list):
        return payload
    urls = [url for output in outputs if isinstance(output, str) for url in [done_file_url(output)] if url]
    if urls:
        payload["output_urls"] = urls
    return payload


def enrich_applications_with_urls(records: list[dict[str, object]]) -> list[dict[str, object]]:
    enriched = []
    for record in records:
        item = dict(record)
        pdf_url = application_output_url(str(item.get("pdf_path", "")), "pdf")
        draft_file_url = application_output_url(str(item.get("draft_path", "")), "draft")
        if pdf_url:
            item["pdf_url"] = pdf_url
        if draft_file_url:
            item["draft_file_url"] = draft_file_url
        enriched.append(item)
    return enriched


def input_counts() -> dict[str, int]:
    if not CONFIG.input_dir.is_dir():
        return {"images": 0, "videos": 0, "pdfs": 0, "other": 0}
    images = list_files_by_suffix(CONFIG.input_dir, IMAGE_SUFFIXES)
    videos = list_files_by_suffix(CONFIG.input_dir, VIDEO_SUFFIXES)
    pdfs = list_files_by_suffix(CONFIG.input_dir, PDF_SUFFIXES)
    known = {path for path in [*images, *videos, *pdfs]}
    other = [path for path in CONFIG.input_dir.iterdir() if path.is_file() and path not in known]
    return {
        "images": len(images),
        "videos": len(videos),
        "pdfs": len(pdfs),
        "other": len(other),
    }


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "version": __version__,
            "config": CONFIG,
            "folders": folder_status(CONFIG),
            "signature": signature_exists(CONFIG),
            "counts": input_counts(),
            "manual_jobs": manual_sign_jobs,
            "inbox_triage": load_inbox_triage(INBOX_TRIAGE_PATH),
            "applications": enrich_applications_with_urls(recent_applications()),
        },
    )


@app.get("/manual-sign/{job_id}", response_class=HTMLResponse)
def manual_sign_page(request: Request, job_id: str) -> HTMLResponse:
    job = manual_sign_jobs.get(job_id)
    return templates.TemplateResponse(
        request,
        "manual_sign.html",
        {
            "job_id": job_id,
            "job": job,
            "config": CONFIG,
            "signature": signature_exists(CONFIG),
        },
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "baxter", "version": __version__}


@app.get("/api/status")
def status() -> dict[str, object]:
    folders = folder_status(CONFIG)
    ready = all(folders.values())
    return {
        "status": "ready" if ready else "missing_folder",
        "folders": folders,
        "base_dir": str(CONFIG.base_dir),
        "signature": signature_exists(CONFIG),
        "input_counts": input_counts(),
        "manual_jobs": len(manual_sign_jobs),
    }


def _read_low_priority_senders() -> list[str]:
    if not GMAIL_LOW_PRIORITY_SENDERS_PATH.is_file():
        return []
    try:
        payload = json.loads(GMAIL_LOW_PRIORITY_SENDERS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    senders = payload.get("senders") if isinstance(payload, dict) else payload
    if not isinstance(senders, list):
        return []
    return sorted({str(sender).strip().lower() for sender in senders if str(sender).strip()})


def _store_low_priority_senders(senders: list[str]) -> list[str]:
    cleaned = sorted({str(sender).strip().lower() for sender in senders if str(sender).strip()})
    GMAIL_LOW_PRIORITY_SENDERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    GMAIL_LOW_PRIORITY_SENDERS_PATH.write_text(
        json.dumps({"senders": cleaned}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return cleaned


def _store_gmail_brief(payload: dict[str, object]) -> JSONResponse:
    triage = store_gmail_brief_as_triage(INBOX_TRIAGE_PATH, payload)
    return JSONResponse(
        {
            "status": "done",
            "success": True,
            "message": "Baxter prevzal Gmail triage a zobrazil ji v Morning Room.",
            "inbox_triage": triage,
        }
    )


@app.get("/api/inbox-triage")
def inbox_triage() -> dict[str, object]:
    return load_inbox_triage(INBOX_TRIAGE_PATH)


@app.post("/api/gmail-briefs")
@app.post("/api/baxter/gmail-brief")
async def gmail_briefs(request: Request) -> JSONResponse:
    payload = await request.json()
    if not isinstance(payload, dict):
        return json_result(JobResult(status="failed", message="Gmail brief ma neplatny format."))
    return _store_gmail_brief(payload)


@app.get("/api/baxter/gmail-brief")
@app.get("/api/baxter/gmail-brief/latest")
def baxter_gmail_brief() -> dict[str, object]:
    return {"latest": load_inbox_triage(INBOX_TRIAGE_PATH)}


@app.get("/api/baxter/gmail-brief/low-priority-senders")
def baxter_low_priority_senders() -> dict[str, list[str]]:
    return {"senders": _read_low_priority_senders()}


@app.post("/api/baxter/gmail-brief/low-priority-senders")
async def baxter_add_low_priority_sender(request: Request) -> JSONResponse:
    payload = await request.json()
    sender = str(payload.get("sender") if isinstance(payload, dict) else "").strip().lower()
    if not sender:
        return json_result(JobResult(status="failed", message="Sender is required."))
    senders = _read_low_priority_senders()
    return JSONResponse({"senders": _store_low_priority_senders([*senders, sender])})


@app.get("/api/applications")
def applications() -> dict[str, object]:
    return {"applications": enrich_applications_with_urls(recent_applications(50))}


@app.post("/api/applications/from-url")
def application_from_url(payload: ApplicationUrlPayload) -> JSONResponse:
    result = prepare_application_from_url(payload.url, CONFIG)
    data = result.to_dict()
    details = data.get("details")
    if isinstance(details, dict):
        pdf_url = application_output_url(str(details.get("pdf_path", "")), "pdf")
        draft_file_url = application_output_url(str(details.get("draft_path", "")), "draft")
        if pdf_url:
            details["pdf_url"] = pdf_url
        if draft_file_url:
            details["draft_file_url"] = draft_file_url
    return JSONResponse(data)


@app.get("/api/applications/{application_id}")
def application_info(application_id: str) -> JSONResponse:
    record = get_application(application_id)
    if record is None:
        return json_result(JobResult(status="failed", message="Žádost neexistuje."))
    pdf_url = application_output_url(str(record.get("pdf_path", "")), "pdf")
    draft_file_url = application_output_url(str(record.get("draft_path", "")), "draft")
    if pdf_url:
        record["pdf_url"] = pdf_url
    if draft_file_url:
        record["draft_file_url"] = draft_file_url
    return JSONResponse(record)


@app.delete("/api/applications/{application_id}")
def application_discard(application_id: str) -> JSONResponse:
    if not discard_application(application_id):
        return json_result(JobResult(status="failed", message="Inzerát už v přehledu není."))
    return json_result(JobResult(status="done", message="Inzerát jsem zahodil z přehledu."))


@app.get("/api/applications/file/{kind}/{filename}", response_model=None)
def application_file(kind: str, filename: str):
    if kind not in {"pdf", "draft"}:
        return json_result(JobResult(status="failed", message="Neznámý typ souboru."))
    folder = CONFIG.done_dir if kind == "pdf" else CONFIG.base_dir / "Koncepty"
    path = (folder / filename).resolve()
    try:
        path.relative_to(folder.resolve())
    except ValueError:
        return json_result(JobResult(status="failed", message="Soubor není v povolené složce."))
    if not path.is_file():
        return json_result(JobResult(status="failed", message="Soubor neexistuje."))
    media_type = "application/pdf" if kind == "pdf" else "text/plain"
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        content_disposition_type="inline",
    )


@app.post("/api/open-folder/{folder_key}")
def open_folder(folder_key: str) -> JSONResponse:
    folders = {
        "base": CONFIG.base_dir,
        "input": CONFIG.input_dir,
        "done": CONFIG.done_dir,
        "error": CONFIG.error_dir,
        "config": CONFIG.config_dir,
    }
    folder = folders.get(folder_key)
    if folder is None:
        return json_result(JobResult(status="failed", message="Neznámá složka."))
    if not folder.is_dir():
        return json_result(JobResult(status="missing_folder", message=f"Složka neexistuje: {folder}"))
    try:
        os.startfile(folder)
    except Exception as exc:
        return json_result(JobResult(status="failed", message=f"Složku se nepodařilo otevřít: {exc}"))
    return json_result(JobResult(status="done", message=f"Otevřel jsem složku: {folder}"))


@app.get("/api/done/{filename}", response_model=None)
def done_file(filename: str):
    path = (CONFIG.done_dir / filename).resolve()
    try:
        path.relative_to(CONFIG.done_dir.resolve())
    except ValueError:
        return json_result(JobResult(status="failed", message="Soubor není v Hotovo."))
    if not path.is_file():
        return json_result(JobResult(status="failed", message="Hotový soubor neexistuje."))
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
        content_disposition_type="inline",
    )


@app.get("/tools/images-to-pdf", response_class=HTMLResponse)
def images_to_pdf_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "images_to_pdf.html", {"config": CONFIG})


@app.get("/tools/video-to-audio", response_class=HTMLResponse)
def video_to_audio_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "video_to_audio.html", {"config": CONFIG})


@app.get("/tools/sign-pdf", response_class=HTMLResponse)
def sign_pdf_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "sign_pdf.html", {"config": CONFIG})


@app.get("/tools/merge-pdf", response_class=HTMLResponse)
def merge_pdf_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "merge_pdf.html", {"config": CONFIG})


@app.post("/api/jobs/image-to-pdf")
def image_to_pdf_job(files: list[UploadFile] = File(...)) -> JSONResponse:
    saved_filenames = []
    for f in files:
        if not f.filename: continue
        path = CONFIG.input_dir / f.filename
        with open(path, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_filenames.append(f.filename)
    
    if not saved_filenames:
        return json_result(JobResult(status="failed", message="Nebyly vybrány žádné soubory."))
        
    return JSONResponse(enrich_outputs_with_urls(convert_images_to_pdf(CONFIG, filenames=saved_filenames).to_dict()))


@app.post("/api/jobs/video-to-audio")
def video_to_audio_job(files: list[UploadFile] = File(...)) -> JSONResponse:
    saved_filenames = []
    for f in files:
        if not f.filename: continue
        path = CONFIG.input_dir / f.filename
        with open(path, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_filenames.append(f.filename)
        
    if not saved_filenames:
        return json_result(JobResult(status="failed", message="Nebyly vybrány žádné soubory."))
        
    return JSONResponse(enrich_outputs_with_urls(convert_videos_to_mp3(CONFIG, filenames=saved_filenames).to_dict()))
def get_inbox_files(file_type: str) -> JSONResponse:
    if file_type == "images":
        suffixes = IMAGE_SUFFIXES
    elif file_type == "videos":
        suffixes = VIDEO_SUFFIXES
    else:
        return JSONResponse({"files": []})
        
    files = list_files_by_suffix(CONFIG.input_dir, suffixes)
    return JSONResponse({"files": [f.name for f in files]})


@app.post("/api/jobs/sign-pdf")
def sign_pdf_job(request: Request, files: list[UploadFile] = File(...)) -> JSONResponse:
    base_url = str(request.base_url).rstrip("/")
    saved_filenames = []
    for f in files:
        if not f.filename: continue
        path = CONFIG.input_dir / f.filename
        with open(path, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_filenames.append(f.filename)
        
    if not saved_filenames:
        return json_result(JobResult(status="failed", message="Nebyl vybrán žádný PDF soubor."))
        
    return JSONResponse(enrich_outputs_with_urls(start_manual_signing(CONFIG, base_url=base_url, filename=saved_filenames[0]).to_dict()))


@app.post("/api/jobs/merge-pdf")
def merge_pdf_job(files: list[UploadFile] = File(...), plan: str | None = Form(None)) -> JSONResponse:
    saved_paths: list[Path] = []
    for upload in files:
        if not upload.filename:
            continue
        filename = Path(upload.filename).name
        if Path(filename).suffix.casefold() not in MERGE_PDF_SUFFIXES:
            _delete_paths(saved_paths)
            return json_result(JobResult(status="failed", message="Merge PDF přijímá pouze PDF soubory."))
        path = unique_path(CONFIG.input_dir / filename)
        with open(path, "wb") as out:
            shutil.copyfileobj(upload.file, out)
        saved_paths.append(path)

    if not saved_paths:
        return json_result(JobResult(status="failed", message="Nebyly vybrány žádné PDF soubory."))

    try:
        parts = parse_merge_parts(json.loads(plan)) if plan else None
    except (json.JSONDecodeError, ValueError) as exc:
        _delete_paths(saved_paths)
        return json_result(JobResult(status="failed", message=str(exc)))

    return JSONResponse(enrich_outputs_with_urls(merge_pdfs(saved_paths, parts=parts, config=CONFIG).to_dict()))


def _delete_paths(paths: list[Path]) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


@app.get("/api/signature", response_model=None)
def signature_image():
    signature_path = resolve_signature_path(CONFIG)
    if not signature_path.is_file():
        return json_result(
            JobResult(
                status="missing_config",
                message="Chybí podpisový obrázek signature.png ve složce Config.",
            )
        )
    return FileResponse(signature_path)


@app.get("/api/manual-sign/{job_id}")
def manual_job_info(job_id: str) -> JSONResponse:
    job = manual_sign_jobs.get(job_id)
    if job is None:
        return json_result(JobResult(status="failed", message="Ruční podpisová úloha neexistuje."))
    folder_error = validate_folders(CONFIG)
    if folder_error:
        return json_result(folder_error)
    if not job.source_pdf.exists():
        return json_result(JobResult(status="failed", message="PDF pro ruční podpis už není ve složce Baxter."))

    with fitz.open(job.source_pdf) as document:
        page_index = job.page_index if job.page_index is not None else max(document.page_count - 1, 0)
        pages = [
            {
                "index": index,
                "width": document[index].rect.width,
                "height": document[index].rect.height,
            }
            for index in range(document.page_count)
        ]
        payload = {
            "status": "needs_input",
            "job_id": job_id,
            "pdf_name": job.source_pdf.name,
            "page_index": page_index,
            "page_count": document.page_count,
            "pages": pages,
            "signature_width_mm": CONFIG.signature_width_mm,
        }
    return JSONResponse(payload)


@app.get("/api/manual-sign/{job_id}/page/{page_index}.png", response_model=None)
def manual_page_image(job_id: str, page_index: int):
    job = manual_sign_jobs.get(job_id)
    if job is None:
        return json_result(JobResult(status="failed", message="Ruční podpisová úloha neexistuje."))
    if not job.source_pdf.exists():
        return json_result(JobResult(status="failed", message="PDF pro ruční podpis už není ve složce Baxter."))

    with fitz.open(job.source_pdf) as document:
        if page_index < 0 or page_index >= document.page_count:
            return json_result(JobResult(status="failed", message="Stránka PDF neexistuje."))
        page = document[page_index]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        data = pixmap.tobytes("png")
    return Response(content=data, media_type="image/png")


@app.post("/api/manual-sign/{job_id}/complete")
def complete_manual_sign(job_id: str, payload: ManualSignaturePayload) -> JSONResponse:
    result = complete_manual_signature(
        job_id=job_id,
        page_index=payload.page_index,
        center_x=payload.center_x,
        center_y=payload.center_y,
        width_mm=payload.width_mm,
        config=CONFIG,
    )
    return JSONResponse(enrich_outputs_with_urls(result.to_dict()))
