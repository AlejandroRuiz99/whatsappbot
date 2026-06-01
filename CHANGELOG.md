# Changelog

All notable changes to the whatsappbot project. Format: phase → PR → list.

## Phase 1 — Cimientos

### PR 1.1 — Env + YAML validation (fail-fast at boot)

**Added**
- `zod` dependency for runtime validation of environment variables and YAML config.
- `src/config/env.ts` rewritten: every value is typed and validated at module load. Invalid environment exits the process with a readable list of issues (path + reason).
- Cross-field rules:
  - `TEST_PHONE_NUMBER` is required when `BOT_MODE=sandbox`.
  - At least one of `GROQ_API_KEY` / `OPENAI_API_KEY` must be set and use the correct prefix.
  - `TELEGRAM_LINK` cannot be the placeholder when `BOT_MODE=production`.
- `src/config/env.ts` exports `providerStatus` and `ragStatus` derived once at boot.
- `src/config/bot-config.ts`: deep zod schema validation of `bot.config.yaml`. Replaces the previous shallow section-presence check. Errors point to the exact field path.
- `src/index.ts`: explicit boot log of provider availability and RAG enablement. Emits `[RAG] disabled: <reason>` when `OPENAI_API_KEY` or `PINECONE_API_KEY` is missing — satisfies master prompt §6.
- `.env.example`: clarified per-mode requirements and removed misleading placeholder defaults that would now fail validation.

**No behavior change** beyond boot validation. No file moves, no interface extraction (those are PR 1.2 / 1.3).

**Notes / divergence from master prompt**
- Master prompt §11 requires "cambio + tests + actualización del YAML si aplica + nota en CHANGELOG.md" per PR. Vitest is not installed yet (planned for Phase 10) and there is no test runner in the repo. Automated tests are deferred to Phase 10 by design; the gate for this PR is a clean `npm run build` plus manual sandbox smoke of the boot path (invalid env exits with readable error; valid env boots normally).
