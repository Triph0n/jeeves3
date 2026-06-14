# PRD: Aunt Agatha B2 Course MVP

## Goal

Turn Aunt Agatha from a verb-of-the-day card into a daily German B2 coach inside Jeeves. The first release must be small, local-first, and usable every day without opening a separate app.

## User Value

- The learner gets one structured B2 lesson per day.
- The learner must actively retrieve, write, correct, and transfer language instead of passively reading tips.
- Agatha remembers attempts, errors, review items, and visible progress.

## Scope

- Keep the existing daily irregular verb card.
- Add a guided B2 lesson workflow to the same Agatha panel.
- Seed an eight-week course with deterministic local lesson templates.
- Store course progress, answers, error log items, and review items in SQLite.
- Show today's lesson, due review items, recent errors, and progress.
- Support typed answers for retrieval, activation, and output tasks.

## Non-Goals

- Full LMS functionality.
- Goethe/telc exam simulation.
- Audio recording or speech scoring.
- AI-generated correction in the first MVP.
- Long free-form chat as the main interface.

## Main Workflow

1. User opens Jeeves and sees Aunt Agatha.
2. Agatha shows the daily B2 target, the verb of the day, and review count.
3. User starts or continues today's lesson.
4. User reads the input, answers retrieval questions, writes activation sentences, and completes one output task.
5. Agatha stores the attempt and generates simple deterministic feedback, error items, and review items.
6. User can clear due review items from the Review tab.

## Functional Requirements

- `GET /api/aunt-agatha/b2/today` returns today's seeded lesson, existing attempts, due review, recent errors, and progress.
- `POST /api/aunt-agatha/b2/attempt` stores an answer for a lesson step and returns feedback plus newly created review/error items.
- `POST /api/aunt-agatha/b2/review/:id` marks a review item complete.
- The UI provides tabs for Today, Review, Course, and Errors.
- The UI works when the server returns only local deterministic data.
- Existing `/api/aunt-agatha/state` behavior continues to work.

## Acceptance Criteria

- A new user can load today's B2 lesson without manual setup.
- A typed output answer is saved and visible after reload.
- Submitting an answer creates at least one review item with a future due date.
- Due review items can be marked done.
- Recent errors are visible in a compact list.
- TypeScript check and production build pass.

## Risks

- The Agatha panel could become too dense; the MVP should keep the first screen compact.
- Deterministic feedback is less rich than AI feedback; the UX should label it as practice feedback, not final expert correction.
