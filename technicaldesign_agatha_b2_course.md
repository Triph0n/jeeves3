# Technical Design: Aunt Agatha B2 Course MVP

## Current Context

Agatha already uses the shared Jeeves Express server and local SQLite database in `.auth/jeeves-usage.sqlite`. The React dashboard component currently loads `/api/aunt-agatha/state` and renders the verb of the day.

## Data Model

Add SQLite tables during existing usage DB initialization:

- `agatha_b2_lessons`: seeded daily lesson content.
- `agatha_b2_attempts`: typed user answers by lesson step.
- `agatha_b2_errors`: compact categorized error observations.
- `agatha_b2_review_items`: scheduled review prompts.

The course itself is generated from local constants. Each lesson has a stable `lesson_id` derived from a day index, an eight-week theme, target phrases, questions, and output task.

## API

- `GET /api/aunt-agatha/b2/today`
  - Ensures today's lesson exists.
  - Returns lesson, attempts, due review items, recent errors, and progress.
- `POST /api/aunt-agatha/b2/attempt`
  - Body: `lessonId`, `step`, `answer`.
  - Stores the attempt.
  - Generates deterministic feedback, a categorized error item, and review items.
- `POST /api/aunt-agatha/b2/review/:id`
  - Marks one review item complete.

## Feedback Strategy

The MVP uses deterministic coaching:

- Empty or very short answers are flagged as incomplete.
- Longer answers get a concise positive nudge.
- Basic German interference patterns are detected with simple regexes.
- Every submitted answer schedules review prompts for Day 1, Day 3, and Day 7.

This keeps the system local-first and reliable. AI feedback can be layered on later behind the same endpoint.

## UI

Extend `AuntAgathaVerbDashboard.tsx` into a compact coaching panel:

- Header: Aunt Agatha + selected tab.
- Top card: portrait, verb of the day, lesson target, progress.
- Today tab: input text, questions, phrase activation, output answer form.
- Review tab: due review items with done buttons.
- Course tab: eight week outline and current day.
- Errors tab: recent categorized issues.

Use existing dark/zinc visual style and small dense controls.

## Validation

- Run `npm run lint`.
- Run `npm run build`.
- Existing Baxter tests are not expected to cover this feature, but should remain unaffected if run.
