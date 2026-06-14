# Baxter Merge PDF PRD

## Goal

Add a Baxter tool that lets the user upload multiple PDF files, arrange them, split them into page-range parts, remove unwanted parts, and merge the remaining parts into one PDF.

## User Value

The user can prepare a final PDF package without leaving Baxter, including quick corrections such as changing document order or removing a page range before generating the result.

## Scope

- Add a dashboard entry and standalone tool page for Merge PDF.
- Accept multiple uploaded PDF files from the browser.
- Show uploaded PDFs as merge parts in the browser.
- Let the user reorder parts before merging.
- Let the user split a part by page ranges.
- Let the user delete any part before merging.
- Generate one merged PDF and open it from Baxter's `Hotovo` folder.

## Non-Goals

- In-browser PDF page thumbnails.
- Editing PDF page contents.
- Password-protected PDF handling beyond a clear failure message.

## Key Workflows

1. User opens Merge PDF from Baxter.
2. User uploads one or more PDFs.
3. Baxter lists each upload as a part.
4. User drags parts to change order.
5. User can split a part using ranges such as `1-2,3,4-6`.
6. User can remove individual parts.
7. User clicks merge and receives one output PDF.

## Functional Requirements

- The merge endpoint must only accept PDFs.
- The merge plan must preserve user-selected order.
- Page ranges must be validated against each source PDF's page count.
- Deleted parts must be omitted from the output.
- Empty plans must fail with a useful message.
- Output must be saved in `Hotovo` and returned through the existing output URL mechanism.

## UX Behavior

- The tool should match Baxter's existing secretary-action pages.
- Drag and drop should work for both upload and part reordering.
- Each part should show source filename and selected pages.
- Split should be simple text input, with examples shown in the prompt.

## Acceptance Criteria

- Multiple uploaded PDFs can be merged into one PDF.
- Reordering parts changes the output order.
- Splitting a PDF into page ranges creates separate movable parts.
- Deleting a part prevents it from appearing in the output.
- Invalid ranges or non-PDF uploads return clear errors.
- Automated tests cover merge ordering, splitting, deletion-by-plan, and invalid ranges.
