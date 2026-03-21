import * as vscode from 'vscode';
import { scanCurrentFile, getSelectedCode, scanProject } from './fileScanner';
import {
  streamChat, setApiKey, getApiKey,
  setBackendToken, getBackendToken,
  MentorMode, ChatMessage,
} from './openaiClient';
import {
  buildFileContext,
  buildSelectionContext,
  buildProjectContext,
  buildUserMessage,
} from './analysisEngine';
import { AdvisorPanel } from './webviewPanel';

// ─── Extension state ──────────────────────────────────────────────────────────

interface SessionState {
  mode: MentorMode;
  history: ChatMessage[];        // full conversation history for context
  attachedContext: string | null; // file / selection / project context
}

const state: SessionState = {
  mode: 'learn',
  history: [],
  attachedContext: null,
};

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  let panel: AdvisorPanel | null = null;

  // ── Sidebar webview provider ──────────────────────────────────────────────
  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      panel = new AdvisorPanel(webviewView.webview);

      panel.onMessage((msg) => {
        switch (msg.type) {
          case 'sendMessage':
            if (msg.text) handleUserMessage(context, panel!, msg.text);
            break;
          case 'setMode':
            if (msg.mode) {
              state.mode = msg.mode;
              state.history = []; // reset history on mode switch — fresh mindset
            }
            break;
          case 'attachFile':
            vscode.commands.executeCommand('ldo.attachFile');
            break;
          case 'attachSelection':
            vscode.commands.executeCommand('ldo.attachSelection');
            break;
          case 'setApiKey':
            vscode.commands.executeCommand('ldo.setApiKey');
            break;
          case 'clearChat':
            state.history = [];
            state.attachedContext = null;
            break;
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ldo.advisorView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.setApiKey', async () => {
      const existing = await getApiKey(context);
      const key = await vscode.window.showInputBox({
        title: "Let's Code Ourselves — OpenAI API Key",
        prompt: 'Enter your OpenAI API key (stored securely, used only in direct mode)',
        password: true,
        value: existing ? '••••••••' : '',
        validateInput: (v) =>
          v === '••••••••' || v.trim().startsWith('sk-') ? null : 'Key should start with "sk-"',
      });
      if (key && key !== '••••••••') {
        await setApiKey(context, key.trim());
        vscode.window.showInformationMessage("API key saved. Let's Code Ourselves is ready!");
      }
    })
  );

  // Backend login — registers / logs in and stores the JWT token
  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.login', async () => {
      const config = vscode.workspace.getConfiguration('ldo');
      const backendUrl: string = config.get('backendUrl', '').trim();

      if (!backendUrl) {
        vscode.window.showErrorMessage(
          'Set ldo.backendUrl in settings first, then log in.'
        );
        return;
      }

      const email = await vscode.window.showInputBox({
        title: "Let's Code Ourselves — Log in",
        prompt: 'Email address',
        validateInput: (v) => v.includes('@') ? null : 'Enter a valid email',
      });
      if (!email) return;

      const password = await vscode.window.showInputBox({
        title: "Let's Code Ourselves — Log in",
        prompt: 'Password',
        password: true,
      });
      if (!password) return;

      try {
        const res = await fetch(`${backendUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: email, password }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }

        const { access_token } = await res.json();
        await setBackendToken(context, access_token);
        vscode.window.showInformationMessage(`Logged in as ${email}. Let's code!`);
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Login failed: ${String(err)}`);
      }
    })
  );

  // Register new account
  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.register', async () => {
      const config = vscode.workspace.getConfiguration('ldo');
      const backendUrl: string = config.get('backendUrl', '').trim();

      if (!backendUrl) {
        vscode.window.showErrorMessage('Set ldo.backendUrl in settings first.');
        return;
      }

      const email = await vscode.window.showInputBox({
        title: "Let's Code Ourselves — Create Account",
        prompt: 'Email address',
        validateInput: (v) => v.includes('@') ? null : 'Enter a valid email',
      });
      if (!email) return;

      const password = await vscode.window.showInputBox({
        title: "Let's Code Ourselves — Create Account",
        prompt: 'Password (min 8 characters)',
        password: true,
        validateInput: (v) => v.length >= 8 ? null : 'At least 8 characters',
      });
      if (!password) return;

      try {
        const res = await fetch(`${backendUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }

        const { access_token } = await res.json();
        await setBackendToken(context, access_token);
        vscode.window.showInformationMessage(
          `Account created! Welcome to Let's Code Ourselves.`
        );
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Registration failed: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.attachFile', async () => {
      const file = await scanCurrentFile();
      if (!file) {
        vscode.window.showWarningMessage('No file is open in the editor.');
        return;
      }
      state.attachedContext = buildFileContext(file);
      panel?.notifyContextAttached(`${file.relativePath}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.attachSelection', () => {
      const sel = getSelectedCode();
      if (!sel) {
        vscode.window.showWarningMessage('No code is selected. Select some code first.');
        return;
      }
      state.attachedContext = buildSelectionContext(sel.code, sel.language, sel.filePath);
      const lines = sel.code.split('\n').length;
      panel?.notifyContextAttached(`${lines} lines from ${sel.filePath}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.attachProject', async () => {
      const snapshot = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Reading project files..." },
        () => scanProject()
      );
      state.attachedContext = buildProjectContext(snapshot);
      panel?.notifyContextAttached(`Entire project (${snapshot.totalFiles} files)`);
    })
  );

  // ── Prompt for API key on first activation ────────────────────────────────
  getApiKey(context).then((key) => {
    if (!key) {
      vscode.window
        .showInformationMessage(
          "Let's Code Ourselves needs an OpenAI API key to work.",
          'Set API Key'
        )
        .then((choice) => {
          if (choice === 'Set API Key') {
            vscode.commands.executeCommand('ldo.setApiKey');
          }
        });
    }
  });
}

export function deactivate(): void {}

// ─── Core chat handler ─────────────────────────────────────────────────────────

function handleUserMessage(
  context: vscode.ExtensionContext,
  panel: AdvisorPanel,
  userText: string
): void {
  // Attach context to first message in the session, then clear it
  // so it doesn't bloat every subsequent request
  const contextToSend = state.attachedContext;
  const fullUserMessage = buildUserMessage(userText, contextToSend);

  // Add to history
  state.history.push({ role: 'user', content: fullUserMessage });

  // Keep history bounded — last 20 turns (10 exchanges)
  if (state.history.length > 20) {
    state.history = state.history.slice(-20);
  }

  // Clear context after first use (user can re-attach if needed)
  if (contextToSend) {
    state.attachedContext = null;
  }

  panel.streamStart();

  let assistantReply = '';

  streamChat(context, state.mode, state.history, {
    onChunk(chunk) {
      assistantReply += chunk;
      panel.streamChunk(chunk);
    },
    onReplace(fullText) {
      // Rule engine redacted something — replace the whole message
      assistantReply = fullText;
      panel.replaceLastMessage(fullText);
    },
    onDone() {
      panel.streamDone();
      state.history.push({ role: 'assistant', content: assistantReply });
    },
    onError(err) {
      panel.showError(err.message);
      state.history.pop(); // remove the failed user message
    },
  });
}
