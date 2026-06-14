# Agatha B2 Course Integration Plan

## Goal

Connect the `german-b2-course-builder` method to Aunt Agatha inside Jeeves 3 so Agatha becomes the daily German B2 coach, not only the "verb of the day" card.

The integration should preserve the existing Agatha identity and local-first Jeeves architecture:

- Agatha remains visible inside the Jeeves dashboard.
- Existing strong-verb practice keeps working.
- New B2 course features build on the same local SQLite database.
- The learning loop follows the Codex skill:

```text
Input -> Immediate Retrieval -> Feedback -> Error Log -> Spaced Retest -> Transfer Task
```

## Current State

Agatha currently has:

- React dashboard component: `src/components/AuntAgathaVerbDashboard.tsx`
- server-side state and endpoints in `server.ts`
- SQLite tables:
  - `agatha_daily_verbs`
  - `agatha_verb_catalog`
  - `agatha_catalog_imports`
  - `agatha_known_verbs`
  - `agatha_review_attempts`
  - `agatha_chat_messages`
- endpoints:
  - `GET /api/aunt-agatha/state`
  - `POST /api/aunt-agatha/open`
  - `POST /api/aunt-agatha/import-verbs`
  - `POST /api/aunt-agatha/chat`
  - `POST /api/aunt-agatha/review`

The existing implementation is deterministic and local. `buildAgathaReply()` is rule-based, so Agatha does not yet generate full B2 lessons dynamically.

## Recommended Architecture

Use a three-layer design:

### 1. Agatha Core Data Layer

Extend SQLite with course state, lessons, retrieval attempts, and errors.

New tables:

```sql
CREATE TABLE IF NOT EXISTS agatha_b2_course (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'B2',
  daily_minutes INTEGER NOT NULL DEFAULT 45,
  started_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agatha_b2_lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  theme TEXT NOT NULL,
  b2_target TEXT NOT NULL,
  input_text TEXT NOT NULL,
  retrieval_questions_json TEXT NOT NULL,
  target_phrases_json TEXT NOT NULL,
  output_task TEXT NOT NULL,
  transfer_task TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agatha_b2_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  answer TEXT NOT NULL,
  feedback TEXT NOT NULL,
  score INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agatha_b2_error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id TEXT,
  original TEXT NOT NULL,
  correction TEXT NOT NULL,
  category TEXT NOT NULL,
  explanation TEXT NOT NULL,
  drill TEXT NOT NULL,
  next_review_at TEXT NOT NULL,
  transfer_topic TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agatha_b2_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_hint TEXT NOT NULL,
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'due'
);
```

### 2. Agatha Lesson Engine

Add server helpers in `server.ts`:

- `ensureAgathaB2Course()`
- `ensureTodayAgathaB2Lesson()`
- `buildAgathaB2Lesson(theme?: string)`
- `evaluateAgathaB2Answer(lesson, kind, answer)`
- `addAgathaB2ErrorLogEntry(...)`
- `scheduleAgathaB2Retests(...)`
- `getAgathaB2State()`

Keep the first version deterministic:

- Generate lessons from local templates and topic banks.
- Use prewritten B2 themes, phrases, and prompts.
- Evaluate retrieval with lightweight rule checks and model-style feedback templates.

Later, optionally connect Gemini to generate richer feedback.

### 3. Agatha UI Layer

Evolve `AuntAgathaVerbDashboard` into a compact study panel with two tabs:

- `Sloveso dne`
- `B2 lekce`

The B2 tab should show:

- today's B2 target
- short input text
- "Zavřít text a testovat" mode
- retrieval answer box
- feedback/result
- target phrases
- transfer task
- due reviews
- small error log summary

Do not make this a new separate app. Agatha should stay in the existing dashboard card.

## API Design

Add these endpoints:

```http
GET /api/aunt-agatha/b2/state
```

Returns:

```json
{
  "course": {},
  "today": {},
  "dueReviews": [],
  "recentErrors": [],
  "stats": {}
}
```

```http
POST /api/aunt-agatha/b2/start
```

Body:

```json
{
  "goal": "praktická B2 plynulost",
  "dailyMinutes": 45,
  "focus": ["speaking", "writing"]
}
```

```http
POST /api/aunt-agatha/b2/lesson
```

Creates or refreshes today's lesson.

Body:

```json
{
  "theme": "Arbeit und Karriere"
}
```

```http
POST /api/aunt-agatha/b2/attempt
```

Body:

```json
{
  "lessonId": "2026-06-14-arbeit",
  "kind": "immediate_retrieval",
  "answer": "..."
}
```

```http
POST /api/aunt-agatha/b2/error"
```

Body:

```json
{
  "lessonId": "...",
  "original": "...",
  "correction": "...",
  "category": "Wortstellung",
  "explanation": "...",
  "drill": "...",
  "transferTopic": "Gesundheit"
}
```

## How The Codex Skill Fits

The Codex skill should be treated as the source of method and templates, not as a runtime dependency.

Practical mapping:

- `SKILL.md` core workflow -> Agatha B2 lesson engine rules
- `b2-learning-method.md` -> retest schedule and lesson loop
- `b2-error-taxonomy.md` -> `category` values in `agatha_b2_error_log`
- `daily-b2-lesson-template.md` -> JSON shape for lessons
- `weekly-b2-plan-template.md` -> optional future course overview screen

This avoids needing Jeeves to call Codex directly.

## MVP

Build the smallest useful version:

1. Add B2 SQLite tables.
2. Add deterministic lesson generator for one daily B2 lesson.
3. Add `GET /api/aunt-agatha/b2/state`.
4. Add `POST /api/aunt-agatha/b2/attempt`.
5. Add a B2 tab to the Agatha card.
6. Show one immediate retrieval task and one transfer task.
7. Store answer, feedback, and error log entries locally.
8. Schedule Day 1, Day 3, Day 7 retests.

Keep existing verb-of-the-day unchanged.

## Phase 2

After MVP works:

- Add weekly course view.
- Add writing correction mode.
- Add speaking prompt mode.
- Add review queue UI.
- Add optional Goethe/telc mode.
- Add Gemini-backed feedback for longer user writing, with local fallback.
- Add Anki CSV export.

## Suggested UI Copy

Tab labels:

- `Sloveso`
- `B2 lekce`

B2 card labels:

- `Dnešní cíl`
- `Přečti`
- `Teď bez koukání`
- `Odpověď`
- `Oprava`
- `Retest`
- `Transfer`

Button labels:

- `Začít B2`
- `Testovat`
- `Uložit chybu`
- `Další retest`

## Implementation Order

1. Create a small planning update in existing Agatha PRD/task docs or keep this plan as the implementation source.
2. Add database tables and helper functions in `server.ts`.
3. Add B2 API endpoints next to existing `/api/aunt-agatha/*` endpoints.
4. Extend the TypeScript state types in `AuntAgathaVerbDashboard.tsx`.
5. Add a simple tab switcher inside the existing Agatha card.
6. Add answer submission and feedback rendering.
7. Run `npm run lint`.
8. Start Jeeves and verify the card in the browser.

## Acceptance Criteria

- Existing Agatha verb card still loads.
- A B2 lesson is visible inside Agatha without opening another app.
- The user can submit an immediate retrieval answer.
- The answer is stored locally.
- Feedback is shown in the Agatha panel.
- At least one retest item is scheduled.
- Recent errors are visible or retrievable from state.
- No Codex runtime dependency is required for Jeeves to run.
