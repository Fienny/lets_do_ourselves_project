# Let's Code Ourselves

> AI mentor that makes you **think** — not a code generator.
> "Stop copying code. Start thinking."

A VS Code extension + FastAPI backend that teaches developers through Socratic questioning. The AI never writes code for you. It asks the right questions until you figure it out yourself.

---

## How it works

| Mode | Behavior |
|---|---|
| 🧠 **Learn** | Pure Socratic method. Always responds with a question. Never gives the answer. |
| 💡 **Hint** | Smallest nudge to unblock you. Points to the concept — not the solution. |
| 🚨 **Emergency** | Direct conceptual walkthrough in plain English. Still zero code. |

A **Rule Engine** runs server-side and strips any code the model accidentally generates before it reaches you.

---

## Project structure

```
lets_do_ourselves_project/
├── src/                        VS Code extension (TypeScript)
│   ├── extension.ts            Entry point, commands, session state
│   ├── openaiClient.ts         Streaming chat — backend or direct OpenAI
│   ├── webviewPanel.ts         Chat UI (sidebar webview)
│   ├── analysisEngine.ts       Context payload builders
│   └── fileScanner.ts          File/project reading utilities
├── backend/                    FastAPI backend (Python)
│   ├── app/
│   │   ├── main.py             App entry point
│   │   ├── config.py           Settings (env-driven)
│   │   ├── database.py         SQLAlchemy setup
│   │   ├── models/
│   │   │   ├── user.py         User model
│   │   │   └── usage.py        Usage tracking / quota
│   │   ├── routers/
│   │   │   ├── auth.py         /auth — register, login, me
│   │   │   ├── chat.py         /chat — SSE stream, quota
│   │   │   └── billing.py      /billing — Stripe checkout + webhook
│   │   └── services/
│   │       ├── ai.py           OpenAI SSE proxy
│   │       └── rule_engine.py  No-code enforcement logic
│   ├── requirements.txt
│   └── .env.example
├── package.json
├── tsconfig.json
├── CLAUDE.md                   Agent action log
└── README.md                   This file
```

---

## Local testing — full walkthrough

You can run and test everything locally in two modes:
- **Direct mode** — extension calls OpenAI directly (no backend needed)
- **Full stack mode** — extension → backend → OpenAI (complete SaaS flow)

---

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.12+ | https://python.org |
| VS Code | any | https://code.visualstudio.com |

You also need an **OpenAI API key** (starts with `sk-`).

---

### Option A — Direct mode (fastest, no backend)

The extension calls OpenAI directly. Good for development and testing the UI.

#### 1. Install extension dependencies

```bash
cd lets_do_ourselves_project
npm install
```

#### 2. Compile the extension

```bash
npm run compile
```

Or watch mode (recompiles on save):

```bash
npm run watch
```

#### 3. Open in VS Code and launch

```bash
code .
```

Then press **F5** (or Run → Start Debugging). This opens a new VS Code window called **Extension Development Host** with the extension loaded.

#### 4. Set your OpenAI API key

In the Extension Development Host window:

1. Open the Command Palette: `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`)
2. Type: `Let's Code Ourselves: Set OpenAI API Key`
3. Enter your key (starts with `sk-`)

#### 5. Open the mentor sidebar

Click the brain icon in the activity bar (left sidebar), or open Command Palette → `Let's Code Ourselves`.

#### 6. Test it

- Type a question like: `"I have a bug in my loop, can you help?"`
- Switch modes using the 🧠 / 💡 / 🚨 buttons
- Open any source file, click **Attach current file**, then ask a question about it
- Select some code, click **Attach selection**, ask about it

**Expected behavior in Learn mode:** The mentor should respond with a question, not an answer. If you ask "what's wrong with my code?", expect "What do you think it should be doing on line X?".

---

### Option B — Full stack (backend + extension)

This tests the complete SaaS flow: auth, quota enforcement, rule engine, Stripe billing.

#### Step 1 — Set up the backend

```bash
cd lets_do_ourselves_project/backend
```

Create your environment file:

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
OPENAI_API_KEY=sk-your-key-here
SECRET_KEY=any-long-random-string-for-jwt-signing
```

For Stripe (optional for basic testing — skip if you only want to test chat):

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

#### Step 2 — Install Python dependencies

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

#### Step 3 — Start the backend

```bash
uvicorn app.main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

The database file `ldo.db` is created automatically.

#### Step 4 — Verify the backend is working

Open http://127.0.0.1:8000/docs in your browser. This is the interactive Swagger UI — you can test every endpoint here.

Quick smoke test with curl:

```bash
# Health check
curl http://localhost:8000/health
# → {"status":"ok","service":"lets-code-ourselves"}

# Register a test account
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'
# → {"access_token": "eyJ...", "token_type": "bearer"}

# Save the token
TOKEN="eyJ..."

# Check quota
curl http://localhost:8000/chat/quota \
  -H "Authorization: Bearer $TOKEN"
# → {"used": 0, "limit": 30, "remaining": 30, "tier": "free", "month": "2026-03"}
```

#### Step 5 — Test the chat endpoint directly

```bash
curl -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "mode": "learn",
    "history": [
      {"role": "user", "content": "My for loop is broken, what is wrong?"}
    ]
  }' \
  --no-buffer
```

You should see a stream of SSE events:

```
event: chunk
data: Walk

event: chunk
data:  me through

event: chunk
data:  what you expect the loop to do...

event: done
data: Walk me through what you expect the loop to do on each iteration. What value should i have when it ends?
```

#### Step 6 — Connect the extension to the backend

In VS Code settings (`Ctrl+,`), search for `ldo.backendUrl` and set it to:

```
http://localhost:8000
```

Then in the Extension Development Host (F5 to launch):

1. Command Palette → `Let's Code Ourselves: Create Account`
2. Enter `test@example.com` / `testpass123`
3. You're logged in — the extension now uses the backend for all requests

#### Step 7 — Test quota enforcement

The free tier allows 30 requests/month. To test hitting the limit quickly, temporarily lower it in `.env`:

```env
FREE_REQUESTS_PER_MONTH=2
```

Restart the backend (`Ctrl+C`, `uvicorn app.main:app --reload`).

Send 3 messages in the extension. The third should show a quota exceeded error in the chat.

---

### Testing the Rule Engine in isolation

The rule engine can be tested directly in Python without running the full server:

```bash
cd backend
python -c "
from app.services.rule_engine import apply_rules, MentorMode

# Test 1: code block gets redacted
text = 'Sure! Here is the solution:\n\`\`\`python\ndef hello():\n    print(\"hello\")\n\`\`\`'
cleaned, violations = apply_rules(text, MentorMode.LEARN)
print('Violations:', [v.rule for v in violations])
print('Cleaned:', cleaned[:80])

# Test 2: clean Socratic response passes
text2 = 'What do you think happens on the last iteration of your loop?'
cleaned2, violations2 = apply_rules(text2, MentorMode.LEARN)
print('Clean response violations:', violations2)
"
```

Expected output:

```
Violations: ['no_code_blocks']
Cleaned: Sure! Here is the solution:

[Code block removed — I'm here to help you think...
Clean response violations: []
```

---

### Useful commands during development

```bash
# Watch TypeScript (extension)
npm run watch

# Check for TypeScript errors without building
npx tsc --noEmit

# Backend — run with auto-reload
uvicorn app.main:app --reload

# Inspect the SQLite database
sqlite3 backend/ldo.db ".tables"
sqlite3 backend/ldo.db "SELECT id, email, is_paid, subscription_status FROM users;"
sqlite3 backend/ldo.db "SELECT * FROM usage_records ORDER BY created_at DESC LIMIT 10;"

# Package the extension for distribution
npm run package
```

---

### Common issues

**Extension doesn't load / F5 shows error**
- Run `npm run compile` first. The `out/` directory must exist.

**"No API key set" in Direct mode**
- Run `Let's Code Ourselves: Set OpenAI API Key` from Command Palette.

**"Cannot reach backend" in Full Stack mode**
- Make sure `uvicorn` is running on port 8000.
- Check `ldo.backendUrl` is set to `http://localhost:8000` (no trailing slash).

**"Invalid credentials" on login**
- The login endpoint uses email as `username`. This is correct (OAuth2 form spec).

**Backend crashes on startup**
- Check `.env` exists and `OPENAI_API_KEY` is set (even a dummy value — it's only used at request time).

**Stripe webhook errors**
- For local Stripe testing, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
  ```bash
  stripe listen --forward-to localhost:8000/billing/webhook
  ```
  Copy the webhook signing secret it prints into `STRIPE_WEBHOOK_SECRET` in `.env`.

---

## Deploying to production

1. **Backend** — deploy to Railway, Render, or Fly.io. Set all env vars from `.env.example`. Change `DATABASE_URL` to a PostgreSQL connection string.
2. **Extension** — update `ldo.backendUrl` default or publish to VS Code Marketplace with `vsce publish`.
3. **Stripe** — set up a real webhook endpoint pointing to `https://your-backend.com/billing/webhook`.
