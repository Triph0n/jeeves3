# Baxter Merge PDF Tasks

## Implementation

- [x] Task 1: Add backend merge logic.
  - Acceptance: PDF parts can be merged by source index and optional page ranges.
  - Verification: Unit tests cover full-file merge, split-range merge, omitted parts, and invalid ranges.

- [x] Task 2: Add Merge PDF API and navigation.
  - Acceptance: Baxter exposes `/tools/merge-pdf` and `POST /api/jobs/merge-pdf`, and the dashboard links to the tool.
  - Verification: Smoke-level route checks and API tests pass.

- [x] Task 3: Add Merge PDF browser UI.
  - Acceptance: User can upload PDFs, reorder parts, split parts into ranges, delete parts, and submit the plan.
  - Verification: Template renders with the expected controls and JavaScript sends files plus plan.

## Final Validation

- [x] Run the relevant automated tests.
- [x] Confirm PRD acceptance criteria are satisfied.
