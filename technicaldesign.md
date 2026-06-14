# Technical Design: Aunt Agatha PDF Verb Source

## Context

Aunt Agatha currently imports a German strong-verb catalog from a web page into the local SQLite database `.auth/jeeves-usage.sqlite`. The dashboard already supports `translationCs`, but rows imported from the web source do not store Czech translations.

## Approach

- Treat `C:\Users\Vladimir\Downloads\2878-nejfrekventovanejsi-nepravidelna-slovesa.pdf` as the new source document.
- Extract the PDF table into a local server-side catalog constant with 68 verbs: infinitive, preterite, perfect form, and Czech translation.
- Replace the old web import path with a local import that refreshes `agatha_verb_catalog` from this extracted PDF catalog.
- Add a `translation_cs` column to `agatha_verb_catalog` with a startup migration for existing databases.
- Preserve existing daily/known/review tables; if an old known verb is not in the new catalog, it is ignored by existing lookup behavior.

## Files

- `server.ts`: source metadata, extracted verb catalog, SQLite migration, import logic, query payloads.
- `PRD_Aunt_Agatha_Verb_Of_The_Day.md`: requirements update.
- `task.md`: implementation checklist.

## Validation

- Verify the PDF extraction count is 68 verbs.
- Run the TypeScript check.
- Run the production build.
