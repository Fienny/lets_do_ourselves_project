# CLAUDE.md — Agent Action Log

This file is maintained by Claude Code and records every significant action taken on this codebase.

---

## Session 1 — Initial build (VS Code Extension MVP)

### Philosophy rewrite
Received the full business plan. Identified that the existing implementation was a one-way code analyzer, not a Socratic mentor. Rewrote the entire core.

### `src/openaiClient.ts`
- Replaced single analysis prompt with three distinct system prompts:
  - **Learn Mode** — pure Socratic method, never answers, always questions
  - **Hint Mode** — smallest nudge to unblock, no code
  - **Emergency Mode** — full conceptual walkthrough, plain English only
- Added `MentorMode` type and `getSystemPrompt()` helper
- Added `getModeLabel()` for UI display
- Added `getApiKey()` / `setApiKey()` using VS Code secret storage
- Replaced one-shot `analyzeCode()` with `streamChat()` using OpenAI streaming API
- Added `ChatMessage` and `StreamChunk` types
- History passed on every request (up to 20 turns)
- `max_tokens: 1024` intentionally capped — mentors are concise

### `src/webviewPanel.ts`
- Replaced results-dump panel with a full **chat UI**
- Mode switcher in header (Learn / Hint / Emergency pill buttons)
- Streaming message bubbles: user messages right-aligned, mentor left-aligned
- Blinking cursor during streaming
- Context bar: shows attached file/selection, dismissible
- Action row: Attach current file, Attach selection, Clear chat, API Key
- Minimal markdown renderer (headings, bold, lists) — intentionally no code block rendering
- Empty state with product tagline
- `onMessage` handler dispatches to extension commands

### `src/analysisEngine.ts`
- Replaced prompt-building functions with **context payload builders**
- `buildFileContext()` — wraps a file for chat context injection
- `buildSelectionContext()` — wraps a code selection
- `buildProjectContext()` — folder tree + key file contents (budget: 12,000 chars)
- `buildUserMessage()` — merges user text + attached context
- Context injected into first message only, then cleared (prevents token bloat)

### `src/extension.ts`
- Added `SessionState` interface: `mode`, `history`, `attachedContext`
- Mode switch resets history (fresh mental model per mode)
- History bounded to last 20 messages
- Commands registered: `ldo.setApiKey`, `ldo.attachFile`, `ldo.attachSelection`, `ldo.attachProject`
- Prompt for API key on first activation

### `package.json`
- Renamed display name to `"Let's Code Ourselves"`
- Added `ldo.openaiModel`, `ldo.defaultMode`, `ldo.maxFileSizeKb`, `ldo.excludePatterns` settings
- Added sidebar view container + webview view
- Added editor context menu items (Attach file, Attach selection)

---

## Session 2 — FastAPI backend (Weeks 2–4 of roadmap)

### New: `backend/` directory

#### `backend/requirements.txt`
FastAPI, uvicorn, SQLAlchemy, Alembic, python-jose, passlib, httpx, openai, stripe, pydantic-settings.

#### `backend/app/config.py`
- `pydantic-settings` `Settings` class — `openai_api_key`, `openai_model`, `secret_key`, `stripe_*`, quotas, `allowed_origins`, `database_url`

#### `backend/app/database.py`
- SQLAlchemy engine + `SessionLocal`, `get_db()` dependency, `create_tables()` on startup

#### `backend/app/models/user.py`
`User` table: `id`, `email`, `hashed_password`, `is_active`, `is_paid`, Stripe IDs, `subscription_status`, timestamps.

#### `backend/app/models/usage.py`
`UsageRecord` table: `id`, `user_id`, `mode`, `tokens_used`, `created_at`, `month_bucket`.

#### `backend/app/routers/auth.py`
`POST /auth/register`, `POST /auth/login` (OAuth2), `GET /auth/me`, `get_current_user()` dependency, bcrypt passwords, HS256 JWT.

#### `backend/app/routers/chat.py`
`POST /chat/stream` (protected, quota-checked, SSE), `GET /chat/quota`.

#### `backend/app/routers/billing.py`
`POST /billing/subscribe`, `GET /billing/portal`, `POST /billing/webhook` (Stripe events: checkout completed, subscription updated/deleted).

#### `backend/app/services/ai.py`
`stream_mentor_response()` async generator — calls OpenAI, emits SSE chunk/replace/done/error, applies rule engine post-stream.

#### `backend/app/services/rule_engine.py`
Three mode prompts (Learn/Hint/Emergency). `apply_rules()` strips code blocks, warns on missing `?`, direct answers, long responses.

### Extension updates (Session 2)
- `openaiClient.ts` — dual-mode routing (backend SSE vs direct OpenAI), `StreamCallbacks` interface, `getBackendToken/setBackendToken`
- `extension.ts` — `ldo.login`, `ldo.register` commands; `onReplace` callback
- `webviewPanel.ts` — `replaceLastMessage()`, `replaceMessage` event handler
- `package.json` — `ldo.backendUrl`, login/register commands

---

## Session 3 — MVP simplification (this session)

### Decision
Stripped everything that isn't core product. No auth, no billing, no tiers, no multiple modes. The product is: one mentor, one philosophy, one endpoint.

### Deleted
- `backend/app/models/` — entire directory (no database)
- `backend/app/database.py` — no database
- `backend/app/routers/auth.py` — no accounts
- `backend/app/routers/billing.py` — no payments
- `backend/app/middleware/` — entire directory

### `backend/requirements.txt`
Stripped to: fastapi, uvicorn, openai, pydantic-settings, python-dotenv.

### `backend/.env.example`
Stripped to: `OPENAI_API_KEY`, `OPENAI_MODEL`, `ALLOWED_ORIGINS`.

### `backend/app/config.py`
Three fields only: `openai_api_key`, `openai_model`, `allowed_origins`.

### `backend/app/services/rule_engine.py`
- Removed `MentorMode` enum — single unified system prompt
- **New system prompt** — single mentor with three behaviors baked in:
  1. Socratic questions for bugs/code problems
  2. Docs awareness — names exact modern API/pattern + explains concept in plain English; always references current versions
  3. Redirect ("stop, use X") only when developer explicitly asks "is my approach right?"
- Rule engine simplified: `validate()` and `apply_rules()` take no mode argument
- Hard block: code blocks stripped and replaced with a redirect message
- Soft warns: no `?` in response, direct answer phrases, response > 1200 chars

### `backend/app/services/ai.py`
- `stream_mentor_response()` takes only `history` — no mode param
- Uses single `SYSTEM_PROMPT` from rule engine (one source of truth)

### `backend/app/routers/chat.py`
- `ChatRequest` schema: `history` only — no `mode` field
- No auth dependency, no quota check
- One route: `POST /chat/stream`

### `backend/app/main.py`
- Mounts only the chat router
- No lifespan DB setup — nothing to initialize

### `src/openaiClient.ts`
- Removed `MentorMode`, `getModeLabel`, `getApiKey/setApiKey`, `getBackendToken/setBackendToken`
- Removed direct OpenAI mode entirely — always calls backend
- `streamChat(context, history, callbacks)` — simplified signature
- If `ldo.backendUrl` not set, shows a clear configuration error

### `src/extension.ts`
- Removed `state.mode` from `SessionState`
- Removed `ldo.setApiKey`, `ldo.login`, `ldo.register` commands
- Removed mode-switching `setMode` message handler
- Clean session state: `history` + `attachedContext` only

### `src/webviewPanel.ts`
- Removed mode switcher buttons entirely
- Removed all mode-related types and message handlers
- Header: title + single tagline, nothing else
- Action row: Attach file, Attach selection, Clear — no API key button

### `package.json`
- Removed `ldo.setApiKey`, `ldo.login`, `ldo.register` commands
- Removed `ldo.defaultMode`, `ldo.openaiModel` settings (backend concerns)
- Kept: `ldo.backendUrl`, `ldo.maxFileSizeKb`, `ldo.excludePatterns`
