# Changelog

All notable changes to the whatsappbot project. Format: phase → PR → list.

## Phase 2 — Pipeline canónico

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
