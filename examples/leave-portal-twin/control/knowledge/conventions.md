# Leave portal conventions (for the builder)

- Next.js 16 App Router + TypeScript + Supabase. Domain logic lives in `src/lib/**` (pure functions, unit-tested);
  pages in `src/app/**`; server actions in `src/app/**/actions.ts`.
- Import alias `@/` = `src/`.
- Tests are protected: never edit `tests/**`. Make the failing AC tests pass by changing product code only.
- Run the tests with `node scripts/factory-tap.mjs` (TAP, one line per AC ID). Do not use npm/npx.
- UI messages are fixed wording from the PM requirements; never rephrase them.
- Keep changes minimal: smallest diff that makes the rule hold in general, not only for the test examples.
- Database changes: only a NEW file in `supabase/migrations/` (timestamp later than every existing one); never edit applied
  migrations. Public RPCs: `security invoker`, `set search_path = ''`, `revoke execute … from public, anon`,
  `grant execute … to authenticated`; `security definer` helpers live only in schema `private`. The DB tests in
  `tests/db/*.test.ts` run every migration on PGlite (real Postgres) — run them with
  `node node_modules/vitest/vitest.mjs run tests/db`.
- Multi-row writes go through ONE Postgres function called with `supabase.rpc(...)` (supabase-js has no transactions).
- `src/lib/supabase/database.types.ts` is generated; without the Supabase CLI add a new function's signature by hand.
- `docs/conformance.md`: one row per AC; a row becomes «реалізовано» only with real code and test paths.
