# Changelog

All notable changes to the whatsappbot project. Format: phase → PR → list.

## Phase 9 — Filtro de respuesta

### PR 9.0 — Response filter with banned phrases, price guard, length limits + corrective retry

**Added (master prompt §5.4)**
- `src/knowledge/llm/response-filter.ts` — `evaluateResponse(text)` returns `{ ok, violations[] }`. Five violation kinds: `banned_phrase`, `unauthorized_price`, `too_long`, `too_many_paragraphs`, `markdown_header`. Authorized prices derived live from `softLimits.consultationPrice` and `softLimits.studyPrice` (no duplicate config).
- `bot.config.yaml:responseFilter` — `maxLength: 1500`, `maxParagraphs: 6`, `bannedPhrases` covering identity (`soy abogada`, `como abogado`, …), guarantees (`tienes derecho a`, `garantizo`, `seguro que gana`, `100% seguro`, …) and AI self-disclosure (`soy una ia`, `como modelo de lenguaje`, …).
- `src/config/bot-config.ts` — zod schema for the new section. Boot fails fast if missing/invalid (master prompt §4.1).
- `src/observability/metrics.ts` — two new variants on `recordMetric`: `response_filter:retry` (a provider produced a violation and was given a second chance) and `response_filter:failed` (the retry also violated, the provider was treated as failed). Counters surfaced in `getMetricsSnapshot()`.

**Wired**
- `src/knowledge/llm/llm.service.ts:tryProvider` — after `stripMarkdown(result)`, runs `evaluateResponse`. On violation: ONE retry with the original messages plus a corrective addon prepended to the system prompt (`buildCorrectionAddon(violations)`). If the retry returns null OR still violates, the provider is treated as failed → `getAIResponse` falls through to the next provider (Groq → OpenAI → local). `addBotMessage(phone, response)` only fires after the filter passes, so conversation memory never stores a rejected response.

**Verified**
- `npm run build` clean (TSC + asset copy).
- Unit smoke on `evaluateResponse` (12 adversarial inputs covering: clean, banned phrases for identity/guarantees/AI, authorized prices `69 euros` & `120 euros` pass, unauthorized `200€` flagged, too long, too many paragraphs, leftover markdown header, edge case `30 días` not mis-flagged as price). All expected results.

**Deferred**
- Live sandbox validation with end-to-end LLM round-trip (requires server boot — left for next session or on-demand).
- Filter does NOT cover `local.js` fallback responses (intentional — those are hardcoded templates we already control).

## Phase 2 — Persistencia (backfill, spec ordering)

### PR 2.0 — SQLite ConversationStore + factory DI + sandbox/extranjería fixes from live test

**Fixed (sandbox bugs surfaced while testing extranjería flow)**
- `src/pipeline/templates.ts`: 4 extranjería variants rewritten — all < 160 chars (single bubble) and without the redundant "Hola/Buenas! Soy Inmaculada…" prefix. Previously the longest variant was 256 chars → humanizer split into 3 bubbles, the first of which was just a re-greeting that overrode mid-conversation context. Phone read from `bot.config.yaml:extranjeria.redirectPhone` via `formatSpanishMobile(digits)` (was hardcoded literal in all 4 templates).
- `src/utils/helpers.ts`: added `formatSpanishMobile(digits)` — formats a 9-digit number as `XXX XX XX XX`.
- `src/pipeline/router.ts:normalizePhone` and `src/conversation/store/memory.ts:normalizePhone`: when stripping non-digits would produce an empty string (sandbox `sandbox_user@s.whatsapp.net`), fall back to the id without the JID suffix. Without this fix the sandbox AI flow saw `phone === ''` and skipped every `if (phone)` guard, so memory was neither read nor written by the AI — every turn was treated as the first one, causing fresh greetings after extranjería redirects.

**Added (Phase 2 backbone — master prompt §4.4)**
- `node:sqlite` (Node 22.5+ built-in, no native deps). WAL journaling enabled via PRAGMA.
- `migrations/0001_initial.sql` — `conversations` table (`phone` PK, `messages` JSON, `created_at`, `last_activity`, `flow`, `escalated`, `resolution`, `rag_cache`). `_migrations` tracking table maintained by the runner.
- `src/conversation/store/sqlite.ts` — `SqliteConversationStore implements ConversationStore`. Idempotent migration runner reads `migrations/*.sql` in lexicographic order and applies the un-applied set. Per-conversation RAG cache TTL identical to the in-memory impl.
- `src/conversation/store/factory.ts` — `initConversationStore()` chooses the store at boot. SQLite activated when `BOT_MODE=production` or `SQLITE_PATH` is set; sandbox defaults to in-memory so manual UI tests reset cleanly.

**Refactored**
- `src/conversation/store/memory.ts`: in-memory logic extracted into a private `InMemoryStore` class implementing `ConversationStore`. The 12 legacy free-function exports (consumed by AI flow, prompt-builder, RAG cache, sandbox UI, admin panel) are now thin delegates over a swappable `activeStore`. New `setActiveStore(store)` lets the factory hot-swap to SQLite **with zero consumer changes**.

**Wired**
- `src/index.ts`: calls `initConversationStore()` before `startMemoryCleanup()`. Boot log shows `[STORE] In-memory store (sandbox default)` or `[STORE] SQLite active at <path>` depending on mode.
- `.gitignore`: ignore `data/`, `*.db*` family. Corrected obsolete RAG paths to `src/knowledge/rag/` post §4.2 reshuffle.

**Verified**
- Smoke #1: in-memory roundtrip (sandbox default) — add/get/delete preserves prior behavior, no log churn.
- Smoke #2: `SQLITE_PATH=./data/smoke.db` — migration `0001_initial.sql` applied, conversation persists; second boot reads back the data, migration tracker reports "schema up to date".
- Live sandbox: extranjería renders as a single bubble, no re-greet; subsequent AI turn retains memory and references the previous redirect instead of greeting again.
- `npm run build` clean.

**Deferred (next Phase 2 PRs)**
- **Audit trail** with PII-hashed phone + last 3 digits (master prompt §4.4).
- **Persisted metrics** — hourly aggregates flushed to SQLite (today they still die on restart).
- **SQLite TTL cleanup timer** (the in-memory cleanup is a no-op when SQLite is the active store; periodic `cleanupStale` lands separately so this PR stays reviewable).

## Phase 4 — Escalado real

> Note on roadmap order: the master prompt §10 lists Phase 2 = Persistencia
> (SQLite) and Phase 3 = Router. PRs `phase2/pr2.1` (`01cb5c2`) and
> `phase2/pr2.2` (`037c5e8`) actually implemented Phase 3 + Phase 5 work
> mislabeled as "Phase 2 — Pipeline canónico". Phase 2 (SQLite) is still
> pending and will be backfilled after Phase 4. Going forward labels match
> the spec.

### PR 4.2 — Escalation false-positive fix (word boundaries + negation guard)

**Fixed (master prompt §5.2)**
- Detection no longer uses raw substring matching. `matchesKeyword` now uses unicode-aware word boundaries via lookbehind/lookahead (`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`), so `urgentemente` does NOT trigger the keyword `urgente`.
- Added a negation guard: if a Spanish negator (`no`, `nunca`, `jamás`, `tampoco`, `sin`, `ni`) appears within the previous 4 tokens before the match, the match is suppressed. `"no es urgente"`, `"ya no es urgente"`, `"no quiero hablar con alguien"` no longer escalate.
- Keywords that themselves start with a negator (e.g. `no entiendo`, `no me sirve`) skip the guard so they still escalate as intended, including the corner case `"no, no entiendo"`.

**Moved**
- Three keyword lists moved from code (`escalate.ts`) to `bot.config.yaml:escalation.{urgencyKeywords,negativeKeywords,complexityKeywords}` — single source of truth per master prompt §4.1. `bot-config.ts` zod schema extended with array validation (≥ 1 entry per list).

**Verification**
- 14/14 detection test cases pass: 7 positive (real escalations), 7 negative (false-positives correctly suppressed including word-boundary and negation cases).
- Build clean.

**Deferred**
- Negation window size (`4`) is hardcoded — could go to yaml if tuning becomes a thing.
- Email/webhook notifier transports (the spec lists Telegram/email/webhook as a composable family). Email lands later if needed.

### PR 4.1 — TelegramEscalationNotifier + richer payload

**Added**
- `src/conversation/escalation/telegram.ts` — `TelegramEscalationNotifier` posts to `https://api.telegram.org/bot<token>/sendMessage` with a Markdown-formatted payload (phone masked to last 3 digits, reason, recent messages, optional conversation URL). 5-second `AbortController` timeout. Truncates body to ≤4000 chars (Telegram limit).
- Wraps a fallback `EscalationNotifier` (defaults to the log impl): on HTTP error, network error, or timeout the alert is delivered via the fallback so it is **never silently lost**. Errors are logged with the upstream cause.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_NOTIFICATION_CHAT_ID` env vars (master prompt §4.3 / §5.2). Both must be set together — `env.ts` superRefine rule rejects partial config.
- `escalationStatus: { transport: 'telegram' | 'log'; reason }` derived once at boot. `src/index.ts` logs `[ESCALATION] transport=telegram` or `[ESCALATION] transport=log — <reason>` so operators can spot a misconfigured deploy.
- `.env.example`: documented Telegram fields with BotFather hint.

**Changed**
- `src/pipeline/router.ts`: escalation flow now passes the last 10 stored messages + the current one as `lastMessages` to the notifier (was: only the current message). This gives the human enough context to act without reading the conversation.
- `src/index.ts`: both router instances (production + sandbox) share the same `notifier` so escalations from the sandbox UI also reach Telegram when configured.

**Behavior**
- Notifier never throws upstream — router/channel cannot fail because of a Telegram outage.
- Currently in this repo: no Telegram keys configured → boot logs `[ESCALATION] transport=log — TELEGRAM_BOT_TOKEN/CHAT_ID not set`. Configuring both keys flips the transport at next boot.

**Verification**
- `npm run build` clean.
- Boot smoke shows the new `[ESCALATION]` line.
- Telegram smoke against a fake token → 401 from real API → fallback notifier fires; alert preserved.

**Deferred to PR 4.2**
- Escalation false-positive correction (master prompt §5.2: "n-gramas o frases, not single tokens"). Today single tokens like `urgente`, `estafa` still substring-match — `\b`-boundary regex + negation guard land in PR 4.2.

## Phase 2 — Pipeline canónico

### PR 2.2 — Fix flow order + soft-limit OR + dedup extranjería + missing metrics

**Fixed**
- **Closure ordering bug (audit critical)**: closure flow moved from #1 to #4 in the router, matching master prompt §3 (existing_client → extranjeria → escalation → closure → ai). An existing client who replies "gracias" now correctly receives the Telegram link instead of an emoji reaction. Verified by smoke (toggle `isExisting=true` + body=`gracias` → `existing_client`; `isExisting=false` + body=`gracias` → `closure`).
- **Soft-limits AND → OR** (`src/knowledge/llm/prompt-builder.ts:301,305,309`): stay in phase N if EITHER threshold is below, per master prompt §5.1. A long detailed first message now stays in cualification instead of jumping to hard-sell.
- **Extranjería keyword duplication**: list lives only in `bot.config.yaml:extranjeria.keywords` (35 entries, merged from the previous handler list and yaml list). `src/pipeline/handlers/extranjeria.ts` now reads `botConfig.extranjeria.keywords` at runtime. Master prompt §4.1: "El código no contiene constantes de negocio".

**Added**
- `recordMetric('flow', 'structural_ignore')` when the channel filter rejects an incoming message (`shouldProcessMessage` returns `!allowed`).
- `recordMetric('flow', 'media')` when the WhatsApp channel takes the media branch.
- Closure-peek removed from `connection.ts` (timing optimization no longer worth the duplication after reorder). Closure now waits `readingDelay + closureReactionDelay` — measured deviation ~500ms on closure-only path; well within humanizer tolerances.

**Known gaps still open**
- Soft-limit can still regress (audit): `getUserTotalChars` reads only last 10 messages; chars can drop after msg #10 and trigger a lower phase. Monotonic max-phase needs a store extension — deferred to a follow-up.
- Metric NAMES still use the legacy Spanish keys (`cliente_existente`, `extranjeria_redirect`, `ia_response`) rather than the spec `Flow` enum. Renaming touches the admin dashboard — deferred to Phase 11 (observability).

**Verification**
- `npm run build` clean.
- Smoke: extranjería detects yaml-sourced keywords (`arraigo familiar`, `inmigrante`, `visado`) and rejects unrelated; closure flow only fires for non-existing clients.

### PR 2.1 — Router seam (single source of truth for §3 flows)

**Added**
- `src/pipeline/router.ts` — `DefaultMessageRouter` implementing `MessageRouter`. Encapsulates the closure → existing_client → extranjeria → escalation → ai dispatch and owns the per-flow metric + escalation event emission.
- `src/pipeline/handlers/closure.ts` — `isClosureMessage` + `getClosureEmoji` (extracted from `channels/whatsapp/handlers.ts`).
- `src/pipeline/handlers/extranjeria.ts` — `isExtranjeriaQuery` (extracted; still hardcoded, dedup with yaml lands in PR 2.2).
- `meta?: Record<string, unknown>` field on `MessageInput` (router contract) to carry channel hints (e.g. sandbox `debugMode`).

**Moved**
- `src/channels/whatsapp/messages.ts` → `src/pipeline/templates.ts` (router-owned templates; the channel is no longer the source of truth for response copy).

**Removed**
- `src/channels/whatsapp/handlers.ts` — `processMessage` and `processSandboxMessage` are gone; their logic now lives in the router.

**Modified**
- `src/channels/whatsapp/connection.ts` — `connectToWhatsApp(router)` now takes a `MessageRouter`. The dispatch chain inside `handleIncomingMessage` is replaced by a single `router.route()` call followed by channel-specific apply logic (reaction vs. text + humanizer split + typing indicators). A closure-peek preserves today's timing exactly: closure path skips the reading delay (uses only `closureReactionDelay`).
- `src/channels/sandbox/index.ts` — exports `sandboxCRM: CRMClient` (reads the UI toggle) and `setRouter(router)` instead of `setMessageHandler(handler)`. `/api/simulate` calls `routeSandboxMessage(router, ...)`.
- `src/channels/sandbox/handler.ts` — replaced with thin adapter `routeSandboxMessage(router, message, debugMode)` that splits the router's text response into per-bubble entries for the UI.
- `src/index.ts` — DI wiring: builds a `productionRouter` with `defaultCRMClient` (always), and in sandbox mode a separate `sandboxRouter` with `sandboxCRM`. The WhatsApp channel uses the production router; the sandbox UI uses the sandbox router. The two router instances share the same store + notifier.

**Behavior**
- Dispatch logic is preserved exactly, including the closure-first ordering bug (spec says #5; current is #1). This is fixed in PR 2.2.
- Sandbox now ALSO runs the closure flow (today's sandbox skipped it). The emoji is rendered as a chat bubble in the sandbox UI since the UI has no native reactions.
- Metric names unchanged (`cliente_existente`, `extranjeria_redirect`, `escalado_*`, `ia_response`). Renaming to spec flow keys lands in PR 2.2.
- Build clean. Runtime smoke: all 4 non-AI router branches return the expected `RoutedResponse`, full boot path (`node dist/index.js`) reaches Fastify listen with both router instances wired.

**Notes / deferred**
- Extranjería keyword duplication (yaml vs. handler) and structural ignore as a router flow remain — PR 2.2 / Phase 3.
- Media (`MEDIA_TYPES`) is still a channel-only branch; folding into router is deferred.
- Tests still deferred to Phase 10.

## Phase 1 — Cimientos

### PR 1.3 — Folder reshuffle to §4.2 + `/health` split

**Moved** (50 `git mv` renames, history preserved):
- `src/whatsapp/*` → `src/channels/whatsapp/*`
- `src/server/sandbox/*` → `src/channels/sandbox/*` (including HTML/JS/CSS assets)
- `src/services/conversation/*` → `src/conversation/{store,classifier,escalation,humanizer}/*` with renames:
  - `classifier.ts` → `classifier/static-list.ts`
  - `humanizer.ts` → `humanizer/index.ts`
  - `*.contract.ts` → `contract.ts` (per subfolder)
  - `conversation.md` → `README.md`
- `src/services/knowledgebase/llm/*` → `src/knowledge/llm/*`
- `src/services/knowledgebase/rag/*` (incl. `tiktok/` and `scripts/` subtrees) → `src/knowledge/rag/*`
- `src/services/knowledgebase/services-catalog/*` → `src/knowledge/catalog/*`
- `src/services/knowledgebase/index.ts` → `src/knowledge/index.ts`
- `src/services/knowledgebase/knowledgebase.md` → `src/knowledge/README.md`
- `src/utils/{logger,log-service,metrics,event-bus}.ts` → `src/observability/*`

**Stays in place**:
- `src/utils/helpers.ts` (pure util, no observability concern)
- `src/server/admin/*` (already correct per §4.2)

**New**:
- `src/server/health/index.ts` — `registerHealthRoutes(app)` extracted from `http.ts`. `/ready` will land in Phase 8.

**Imports**: 62 relative-import paths rewritten across 24 files (depth-aware recompute via a one-shot Node script, removed after use). Asset paths in `scripts/copy-assets.js` updated.

**Verification**:
- `npm run build` exits 0.
- Runtime boot (`node dist/index.js`) reaches Fastify listen, RAG-enabled log fires, all 5 default contracts load.

**Behavior**: zero functional change. No DI wiring beyond the contracts already in PR 1.2; no router implementation (Phase 2); no auth / SQLite / response-filter (later phases).

### PR 1.2 — Interface contracts (§4.3), additive, no file moves

**Added**
- 5 new `*.contract.ts` files declaring the stable internal contracts from master prompt §4.3 plus thin default adapters around the current free functions:
  - `src/services/conversation/store.contract.ts` — `ConversationStore` + `defaultConversationStore` (wraps `memory.ts`).
  - `src/services/conversation/classifier.contract.ts` — `CRMClient` + `defaultCRMClient` (wraps `classifier.ts`, async at the boundary).
  - `src/services/conversation/escalation.contract.ts` — `EscalationNotifier` + `EscalationPayload` (spec shape: `phone, reason, lastMessages, conversationUrl?`) + `defaultEscalationNotifier` (wraps `escalate.ts:notifyHuman`).
  - `src/services/knowledgebase/llm/provider.contract.ts` — `LLMProvider` + `groqProvider` / `openaiProvider` / `defaultProviders` (preserves current Groq → OpenAI priority).
  - `src/pipeline/router.contract.ts` — `MessageRouter`, `MessageInput`, `RoutedResponse`, `Flow` union with the 6 spec flows. No implementation yet (lands in PR 1.3 alongside DI).

**Behavior**
- Strictly additive. No existing module was modified. Build clean, runtime smoke verified all 5 default impls.

**Notes / divergence**
- Contracts live next to current modules (rather than in `src/contracts/`) to anticipate the §4.2 reshuffle in PR 1.3 and avoid double churn.
- Tests still deferred to Phase 10. Smoke test (runtime exercise of all 5 default impls) is the gate.

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
