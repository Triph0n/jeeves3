# Baxter API for Jeeves 3

Base URL:

```text
http://127.0.0.1:8765
```

## Health

```text
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "app": "baxter",
  "version": "0.1.0"
}
```

## Status

```text
GET /api/status
```

Example response:

```json
{
  "status": "ready",
  "folders": {
    "base": true,
    "input": true,
    "done": true,
    "error": true,
    "config": true
  },
  "base_dir": "C:\\Users\\Vladimir\\Desktop\\Baxter",
  "signature": true,
  "input_counts": {
    "images": 0,
    "videos": 0,
    "pdfs": 1,
    "other": 0
  },
  "manual_jobs": 0
}
```

## Images to PDF

```text
POST /api/jobs/image-to-pdf
```

Jeeves should call this when the user asks Baxter to convert images. Baxter processes all JPG/PNG files placed directly in the `Baxter` folder, creates one PDF, and moves inputs plus output to `Hotovo`.

## Video to MP3

```text
POST /api/jobs/video-to-audio
```

Jeeves should call this when the user asks Baxter to extract audio. Baxter processes all supported video files placed directly in the `Baxter` folder, converts them to MP3, and moves inputs plus outputs to `Hotovo`.

## Sign PDF

```text
POST /api/jobs/sign-pdf
```

Baxter processes PDF files placed directly in the `Baxter` folder.

Current MVP behavior: Baxter opens manual signing as the primary flow. Jeeves should expect `needs_input` with `manual_url` and open that URL for the user.

Manual placement response:

```json
{
  "status": "needs_input",
  "message": "Otevřel jsem PDF pro ruční umístění podpisu.",
  "outputs": [],
  "manual_url": "http://127.0.0.1:8765/manual-sign/abc123",
  "details": {
    "job_id": "abc123",
    "pdf": "C:\\Users\\Vladimir\\Desktop\\Baxter\\Vstup\\smlouva.pdf"
  }
}
```

Jeeves should open or announce `manual_url`.

## Application from advert URL

```text
POST /api/applications/from-url
Content-Type: application/json

{
  "url": "https://example.ch/inserat"
}
```

Baxter fetches the advert, extracts school/contact/email data, creates a German cover letter PDF, merges it with the configured application materials PDF, and writes a Gmail-ready draft into the Baxter `Koncepty` folder.

For now Baxter prepares a draft for manual review; it does not send email automatically. Jeeves can show these links back to the user:

- `details.source_url`: original advert.
- `details.pdf_url`: generated PDF package.
- `details.draft_file_url`: prepared email draft text.
- `details.draft_url`: Gmail drafts folder.
- `details.compose_url`: Gmail compose URL with recipient/body prefilled, without attachment.

Example response:

```json
{
  "status": "done",
  "message": "Připravil jsem PDF a emailový koncept.",
  "outputs": [
    "C:\\Users\\Vladimir\\Desktop\\Baxter\\Hotovo\\Bewerbung_Musikschule_20260527.pdf",
    "C:\\Users\\Vladimir\\Desktop\\Baxter\\Koncepty\\musikschule_20260527_1015.txt"
  ],
  "details": {
    "source_url": "https://example.ch/inserat",
    "school_name": "Musikschule Beispiel",
    "email": "bewerbung@example.ch",
    "draft_url": "https://mail.google.com/mail/u/0/#drafts",
    "pdf_url": "/api/applications/file/pdf/Bewerbung_Musikschule_20260527.pdf",
    "draft_file_url": "/api/applications/file/draft/musikschule_20260527_1015.txt"
  }
}
```

If key data is missing, Baxter returns `needs_input` and still prepares draft files where the user can fill missing fields manually.

Missing signature:

```json
{
  "status": "missing_config",
  "message": "Chybí podpisový obrázek signature.png ve složce Config.",
  "outputs": []
}
```

## Merge PDF

```text
POST /api/jobs/merge-pdf
Content-Type: multipart/form-data
```

Fields:

- `files`: one or more uploaded PDF files.
- `plan`: optional JSON merge plan. If omitted, Baxter merges full PDFs in upload order.

Example plan:

```json
{
  "parts": [
    {"file_index": 0, "start_page": 1, "end_page": 2},
    {"file_index": 1},
    {"file_index": 0, "start_page": 3, "end_page": 3}
  ]
}
```

Successful response:

```json
{
  "status": "done",
  "message": "PDF soubory byly spojeny.",
  "outputs": [
    "C:\\Users\\Vladimir\\Desktop\\Baxter\\Hotovo\\document_merged.pdf"
  ],
  "output_urls": [
    "/api/done/document_merged.pdf"
  ],
  "details": {
    "processed": 3,
    "sources": 2
  }
}
```

## Status Values

- `done`: task completed.
- `failed`: task failed.
- `needs_input`: user must complete manual signing in Baxter UI.
- `missing_config`: configuration is missing, usually `signature.png` or FFmpeg.
- `missing_folder`: one of the required working folders is missing.
