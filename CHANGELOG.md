# Changelog

All notable changes to the whatsappbot project. Format: phase → PR → list.

## Phase 4 — Escalado real

> Note on roadmap order: the master prompt §10 lists Phase 2 = Persistencia
> (SQLite) and Phase 3 = Router. PRs `phase2/pr2.1` (`01cb5c2`) and
> `phase2/pr2.2` (`037c5e8`) actually implemented Phase 3 + Phase 5 work
> mislabeled as "Phase 2 — Pipeline canónico". Phase 2 (SQLite) is still
> pending and will be backfilled after Phase 4. Going forward labels match
> the spec.

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
