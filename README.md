# Let's Code Ourselves

> AI mentor that makes you **think** — not a code generator.
> "Stop copying code. Start thinking."

A VS Code extension + Python backend. You ask a question about your code. The AI never writes code for you. It asks you questions until *you* figure it out.

The server enforces this with a rule engine — if the AI accidentally generates code, it's stripped out before you ever see it.

---

## What it looks like

You open the sidebar in VS Code. You type a question. You can optionally attach the file you're working on, or just a selected chunk of code. The mentor responds — always with questions, never with answers.

That's it. No accounts. No billing. No modes to configure. One mentor, one philosophy.

---

## How it works (big picture)

```
Your VS Code extension
        │
        │  POST /chat/stream  (your question + conversation history)
        ▼
   Python backend  ──────►  OpenAI  ──────►  streams text back
        │
        │  Rule engine checks every response
        │  (strips code blocks before they reach you)
        ▼
   Text streams back into the VS Code chat panel
```

You need to run the backend yourself on your own machine. It's two commands. The extension connects to it over localhost.

---

## Before you start — what you need

You need four things installed on your computer. If you already have them, skip ahead.

### 1. Node.js (version 18 or newer)

Node runs the VS Code extension build tools.

- Go to https://nodejs.org
- Download the **LTS** version (the one that says "Recommended For Most Users")
- Run the installer, click Next through everything

Check it worked — open a terminal and run:
```bash
node --version
```
You should see something like `v20.11.0`. Any number starting with 18 or higher is fine.

### 2. Python (version 3.12 or newer)

Python runs the backend server.

- Go to https://python.org/downloads
- Download the latest 3.12.x or 3.13.x release
- Run the installer
- **Windows users:** on the first screen of the installer, check the box that says **"Add Python to PATH"** — this is easy to miss and will cause problems if you skip it

Check it worked:
```bash
python --version
```
You should see `Python 3.12.x` or higher.

> **Windows note:** if `python` doesn't work, try `python3` instead. Same thing.

### 3. VS Code

- Go to https://code.visualstudio.com
- Download and install it
- Nothing special to configure

### 4. An OpenAI API key

The backend uses this to call GPT-4o.

- Go to https://platform.openai.com/api-keys
- Sign in (or create an account)
- Click **"Create new secret key"**
- Copy it somewhere safe — it starts with `sk-` and you won't be able to see it again after you close the dialog
- Make sure your account has credits (https://platform.openai.com/settings/billing) — a few dollars is plenty for testing

---

## Installation

### Step 1 — Get the code

If you have git:
```bash
git clone <repo-url>
cd lets_do_ourselves_project
```

Or download the ZIP from GitHub, unzip it, and open a terminal inside the `lets_do_ourselves_project` folder.

---

### Step 2 — Set up the backend

The backend is a Python web server. It receives your questions, forwards them to OpenAI, and streams the response back.

**Open a terminal and navigate to the backend folder:**
```bash
cd backend
```

**Create the environment file:**
```bash
cp .env.example .env
```

This copies the template config into a real `.env` file. Now open `.env` in any text editor and fill in your OpenAI key:

```env
OPENAI_API_KEY=sk-your-actual-key-here
OPENAI_MODEL=gpt-4o
ALLOWED_ORIGINS=vscode-webview://,http://localhost:3000
```

Change `sk-your-actual-key-here` to your real key. Leave everything else as-is.

**Create a Python virtual environment:**

A virtual environment is an isolated box for Python packages — it keeps this project's dependencies separate from anything else on your machine. Always use one.

```bash
python -m venv .venv
```

**Activate the virtual environment:**

This step is different depending on your OS:

- **Mac / Linux:**
  ```bash
  source .venv/bin/activate
  ```
- **Windows (Command Prompt):**
  ```bash
  .venv\Scripts\activate
  ```
- **Windows (PowerShell):**
  ```bash
  .venv\Scripts\Activate.ps1
  ```

After activation, your terminal prompt will show `(.venv)` at the start. That means it's working. **You need to do this every time you open a new terminal to run the backend.**

**Install the Python dependencies:**
```bash
pip install -r requirements.txt
```

This downloads FastAPI, the OpenAI SDK, and a few other packages. It takes about 30 seconds.

**Start the backend server:**
```bash
uvicorn app.main:app --reload --port 8000
```

You should see output like this:
```
INFO:     Will watch for changes in these directories: ['/path/to/backend']
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Application startup complete.
```

The `--reload` flag means the server automatically restarts if you edit a file — useful during development.

**Leave this terminal open.** The server needs to keep running. Open a new terminal for the next steps.

**Verify it works:**
```bash
curl http://localhost:8000/health
```

You should see:
```json
{"status": "ok"}
```

If `curl` isn't installed on Windows, open http://localhost:8000/health in your browser — same thing.

---

### Step 3 — Set up the extension

Open a **new terminal** (keep the backend terminal running) and navigate back to the project root:

```bash
cd lets_do_ourselves_project   # or wherever your project root is
```

**Install the Node dependencies:**
```bash
npm install
```

This downloads the TypeScript compiler and VS Code extension tooling. Takes about 20 seconds.

**Compile the TypeScript:**
```bash
npm run compile
```

This converts the TypeScript source files in `src/` into JavaScript in `out/`. VS Code runs the compiled JavaScript, not the TypeScript directly.

You should see no errors — just a brief pause and then your prompt returns.

> **Tip:** If you're going to edit the extension code, run `npm run watch` instead. It recompiles automatically every time you save a file.

---

### Step 4 — Configure the backend URL in VS Code

The extension needs to know where your backend is running.

1. Open VS Code in the project folder:
   ```bash
   code .
   ```
2. Open Settings: `Ctrl+,` (Mac: `Cmd+,`)
3. In the search box at the top, type: `ldo.backendUrl`
4. Set the value to:
   ```
   http://localhost:8000
   ```
   (no trailing slash)

---

### Step 5 — Launch the extension

Press **F5** in VS Code.

**Important: VS Code will do several things before the second window opens. Here is exactly what to expect, step by step.**

---

#### What happens the moment you press F5

VS Code reads `.vscode/launch.json`, which says "before launching, run the default build task". The default build task is defined in `.vscode/tasks.json` as `npm run watch` — the TypeScript compiler in watch mode.

So the sequence is:
1. VS Code starts `npm run watch` in a background terminal
2. The compiler does its first full build (a few seconds)
3. Once the build succeeds, VS Code opens the second window

---

#### Dialog: "This task has a problem matcher that tracks when it is active..."

Some versions of VS Code show this the very first time you run the extension. It's asking whether to keep using the background task.

**Click "Continue and don't show again"** or just **"Continue"**.

This is not an error. It's just VS Code being cautious about long-running background tasks.

---

#### Dialog: "Select the task to run" (task picker opens)

This means `${defaultBuildTask}` didn't resolve automatically. VS Code is asking you to pick the build task manually.

Look for **`npm: watch`** in the list and select it.

If you don't see `npm: watch`, it means `npm install` was never run. Cancel the dialog, run `npm install` in the terminal, then press F5 again.

---

#### Dialog: "Configure Task" or the task list is empty

Same root cause as above — `npm install` was never run, so Node can't find the TypeScript compiler. Cancel, run `npm install`, then F5 again.

---

#### A terminal panel opens at the bottom with TypeScript output

This is normal. You'll see something like:

```
Starting compilation in watch mode...
Found 0 errors. Watching for file changes.
```

**"Found 0 errors"** → good, the second window will open in a moment.

**"error TS..."** → there is a TypeScript compile error. The second window will not open. See the TypeScript errors section in Common Problems below.

---

#### Nothing happens at all / VS Code just sits there

The background task started but VS Code is waiting for confirmation that the first compile finished. This is controlled by the `problemMatcher: "$tsc-watch"` setting in `tasks.json` — it watches the terminal output for the phrase `"Found 0 errors"` to know compilation is done.

If the terminal never prints that phrase (e.g. because of errors), the second window never opens.

Check the terminal panel at the bottom of VS Code for error messages.

---

#### The second window finally opens — what to do in it

The second window is called the **Extension Development Host**. It is a sandboxed VS Code instance running your extension. Think of it as the "test" window.

- The **original window** is where you edit code
- The **second window** is where you use the extension

In the **second window**:

1. Look at the Activity Bar on the far left — you should see a new icon added by the extension (it may be at the bottom of the icon list)
2. Click it to open the **Let's Code Ourselves** panel
3. The chat interface should appear on the left side

> If you don't see the icon: open the Command Palette with `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`), type `Let's Code`, and look for **"Let's Code Ourselves: Open Mentor"**. If that command doesn't appear, the extension didn't load — see the "chat panel is blank" troubleshooting section below.

---

### Step 6 — Test it

In the chat panel, type a question:

```
I have a bug in my for loop. Can you help?
```

The mentor should respond with a question, not an answer. Something like:

> *"Walk me through what you expect the loop to do on each iteration. What value do you think `i` should have when it finishes?"*

If you see that — everything is working.

**Try attaching a file:**
1. Open any source file in the editor (JS, Python, whatever)
2. Click **Attach file** in the chat panel
3. Ask a question about the code

**Try attaching a selection:**
1. Select a few lines of code in the editor
2. Click **Attach selection** in the chat panel
3. Ask a question about just those lines

---

## Stopping and restarting

**To stop the backend:** go to the terminal running `uvicorn` and press `Ctrl+C`.

**To restart the backend:**
```bash
cd backend
source .venv/bin/activate   # or Windows equivalent
uvicorn app.main:app --reload --port 8000
```

**To stop the extension:** close the Extension Development Host window, or press `Shift+F5` in the main VS Code window.

**To restart the extension:** press F5 again in the main VS Code window.

---

## Testing the rule engine by itself

The rule engine is the part that ensures the AI never sends you code. You can test it directly in Python without running any server:

```bash
cd backend
source .venv/bin/activate
python -c "
from app.services.rule_engine import apply_rules

# Test 1: AI accidentally writes code — should be stripped
sneaky_response = '''Sure! Here is the fix:
\`\`\`python
def hello():
    print('hello')
\`\`\`
'''
cleaned, violations = apply_rules(sneaky_response)
print('=== Test 1: Code block ===')
print('Violations:', [v.rule for v in violations])
print('Cleaned output:')
print(cleaned)

# Test 2: Good Socratic response — should pass unchanged
good_response = 'What do you think happens to the variable on line 3 when the loop runs a second time?'
cleaned2, violations2 = apply_rules(good_response)
print()
print('=== Test 2: Good response ===')
print('Violations:', violations2)
print('Passed through unchanged:', cleaned2 == good_response)
"
```

Expected output:
```
=== Test 1: Code block ===
Violations: ['no_code_blocks']
Cleaned output:
Sure! Here is the fix:

[I've removed code from my response — my job is to help you write it, not write it for you. What part of the logic are you uncertain about?]

=== Test 2: Good response ===
Violations: []
Passed through unchanged: True
```

---

## Testing the chat endpoint directly (no VS Code)

You can talk to the backend with `curl` to verify it's working before touching the extension:

```bash
curl -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "history": [
      {"role": "user", "content": "My function returns None and I have no idea why"}
    ]
  }' \
  --no-buffer
```

You'll see a stream of Server-Sent Events:
```
event: chunk
data: What

event: chunk
data:  does the function

event: chunk
data:  look like — is there a return statement at the end of every possible path?

event: done
data: What does the function look like — is there a return statement at the end of every possible path?
```

Each `chunk` is a piece of the streamed response. `done` fires when the full response is assembled and the rule engine has checked it.

---

## Project structure (for the curious)

```
lets_do_ourselves_project/
│
├── src/                         VS Code extension (TypeScript)
│   ├── extension.ts             Entry point — registers commands, manages session
│   ├── openaiClient.ts          Calls the backend, handles SSE streaming
│   ├── webviewPanel.ts          The chat UI rendered inside VS Code
│   ├── analysisEngine.ts        Builds context payloads (file, selection, project)
│   └── fileScanner.ts           Reads files and project structure from disk
│
├── backend/                     Python API server (FastAPI)
│   ├── app/
│   │   ├── main.py              Server entry point, CORS config
│   │   ├── config.py            Reads settings from .env
│   │   ├── routers/
│   │   │   └── chat.py          POST /chat/stream — the only endpoint
│   │   └── services/
│   │       ├── ai.py            Calls OpenAI, emits SSE events
│   │       └── rule_engine.py   System prompt + no-code enforcement
│   ├── requirements.txt         Python dependencies
│   └── .env.example             Config template (copy to .env)
│
├── package.json                 Extension manifest + npm scripts
├── tsconfig.json                TypeScript compiler config
├── CLAUDE.md                    Agent action log
└── README.md                    This file
```

---

## Common problems

### "Cannot reach backend" in the chat panel

- Make sure `uvicorn` is actually running (check the backend terminal)
- Make sure `ldo.backendUrl` is set to `http://localhost:8000` with no trailing slash
- Make sure there's no firewall blocking port 8000

### The chat panel is blank / won't open / extension icon is missing

**Step 1: Check whether the extension actually loaded.**
In the Extension Development Host window, open the Command Palette (`Ctrl+Shift+P`) and type `Let's Code`. If no commands appear, the extension didn't load at all.

**Step 2: Check the Debug Console.**
In the *original* VS Code window (not the second one), go to **View → Debug Console**. Any crash or startup error from the extension will appear there in red.

**Step 3: Check whether the TypeScript was compiled.**
Look for an `out/` folder in the project root. If it doesn't exist or is empty, the build never ran.

Fix: run `npm install` then `npm run compile` in the terminal, then press F5 again.

**Step 4: Check the terminal panel for TypeScript errors.**
When you press F5, a terminal tab opens at the bottom. It should say `Found 0 errors`. If it says `error TS...`, there is a compile error — the extension will not load until all errors are resolved. Read the error message; it will say exactly which file and line has the problem.

### TypeScript errors when compiling

- Run `npm install` first — missing packages cause most compile errors
- Make sure your Node.js version is 18 or higher (`node --version`)

### Backend crashes on startup with "ValidationError"

- Your `.env` file is missing or the `OPENAI_API_KEY` is empty
- Open `backend/.env` and make sure the key is there (even a placeholder like `sk-test` will let the server start — it only actually calls OpenAI when you send a message)

### Backend starts but chat returns an error about OpenAI

- Your API key is wrong or has no credits
- Check https://platform.openai.com/api-keys — make sure the key is active
- Check https://platform.openai.com/settings/billing — make sure you have a balance

### `pip install` fails with permission errors

- You forgot to activate the virtual environment
- Run `source .venv/bin/activate` (Mac/Linux) or `.venv\Scripts\activate` (Windows) first

### `python -m venv .venv` fails on Ubuntu/Debian

Some Linux systems don't include the `venv` module by default. Fix it with:
```bash
sudo apt install python3-venv
```
Then retry.

### Windows: "execution of scripts is disabled on this system"

This is PowerShell's security policy blocking `.ps1` scripts. Fix it by running:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then retry activating the virtual environment.

---

## Useful commands

```bash
# Compile the extension once
npm run compile

# Compile the extension and watch for changes (keep this running while developing)
npm run watch

# Check for TypeScript errors without producing output files
npx tsc --noEmit

# Start the backend (from backend/ with venv activated)
uvicorn app.main:app --reload --port 8000

# Package the extension into a .vsix file for distribution
npm run package
```
