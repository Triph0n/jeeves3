# Baxter Merge PDF Technical Design

## Current Context

Baxter is a FastAPI app. Existing upload tools save browser uploads into `CONFIG.input_dir`, process them, move inputs and outputs to `CONFIG.done_dir`, and return a `JobResult` enriched with `/api/done/...` links.

PyMuPDF (`fitz`) is already a dependency and is used by PDF signing, so Merge PDF can use the same library without adding packages.

## Implementation Approach

- Add `baxter/merge_pdf.py`.
- Represent each merge part as a validated source index plus optional one-based page range.
- Use `fitz.Document.insert_pdf()` to append the selected pages into a new output document.
- Save the output in `CONFIG.input_dir`, then move uploaded inputs and the output to `Hotovo`.
- Add `POST /api/jobs/merge-pdf` accepting multipart files plus a JSON `plan` form field.
- Add `/tools/merge-pdf` route and a `merge_pdf.html` template.
- Add a dashboard link under Secretariat Actions.

## Merge Plan

The browser sends:

```json
{
  "parts": [
    {"file_index": 0, "start_page": 1, "end_page": 2},
    {"file_index": 1},
    {"file_index": 0, "start_page": 3, "end_page": 3}
  ]
}
```

If `start_page` and `end_page` are omitted, the whole source PDF is used.

## Validation and Errors

- Reject empty uploads.
- Reject non-PDF filenames.
- Reject missing or malformed plan JSON.
- Reject out-of-bounds file indexes.
- Reject ranges below page 1, reversed ranges, or ranges beyond the PDF's page count.
- Return `JobResult(status="failed", message=...)` for user-facing errors.

## Files To Change

- `Baxter/baxter/merge_pdf.py`
- `Baxter/baxter/api.py`
- `Baxter/templates/merge_pdf.html`
- `Baxter/templates/dashboard.html`
- `Baxter/tests/test_core.py`
- `Baxter/docs/API_FOR_JEEVES.md`

## Testing Strategy

- Unit tests create temporary sample PDFs with PyMuPDF.
- Verify merged output page order by reading inserted page text.
- Verify split ranges and omitted ranges.
- Verify invalid ranges fail before output is finalized.
- Run Baxter's existing pytest suite.

## Risks and Mitigations

- Uploaded duplicate filenames can overwrite existing files. Use `unique_path()` when saving Merge PDF uploads.
- Invalid plan can reference missing files. Validate file indexes before opening source PDFs.
- Password-protected or unreadable PDFs can fail. Catch exceptions and return a clear message.
