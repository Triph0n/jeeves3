# Tasks: Aunt Agatha B2 Course MVP

## Planning

- [x] Define the MVP product behavior.
- [x] Define the data model, API, and UI workflow.

## Implementation

- [x] Add Agatha B2 SQLite tables and seed lesson helpers.
  - Acceptance: the server can create or fetch today's local B2 lesson.
  - Verification: TypeScript compiles.

- [x] Add B2 lesson, attempt, and review API routes.
  - Acceptance: endpoints return today's lesson state, store answers, and complete review items.
  - Verification: targeted local route logic is covered by typecheck/build.

- [x] Add the Agatha B2 panel UI.
  - Acceptance: Today, Review, Course, and Errors tabs are visible and usable.
  - Verification: production build passes.

## Final Validation

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Confirm the PRD acceptance criteria are satisfied.
