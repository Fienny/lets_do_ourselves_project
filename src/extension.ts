import * as vscode from 'vscode';
import { scanCurrentFile, getSelectedCode, scanProject } from './fileScanner';
import { streamChat, ChatMessage } from './openaiClient';
import {
  buildFileContext,
  buildSelectionContext,
  buildProjectContext,
  buildUserMessage,
} from './analysisEngine';
import { AdvisorPanel } from './webviewPanel';

interface SessionState {
  history: ChatMessage[];
  attachedContext: string | null;
}

const state: SessionState = {
  history: [],
  attachedContext: null,
};

export function activate(context: vscode.ExtensionContext): void {
  let panel: AdvisorPanel | null = null;

  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      panel = new AdvisorPanel(webviewView.webview);

      panel.onMessage((msg) => {
        switch (msg.type) {
          case 'sendMessage':
            if (msg.text) handleUserMessage(context, panel!, msg.text);
            break;
          case 'attachFile':
            vscode.commands.executeCommand('ldo.attachFile');
            break;
          case 'attachSelection':
            vscode.commands.executeCommand('ldo.attachSelection');
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

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.attachFile', async () => {
      const file = await scanCurrentFile();
      if (!file) {
        vscode.window.showWarningMessage('No file is open in the editor.');
        return;
      }
      state.attachedContext = buildFileContext(file);
      panel?.notifyContextAttached(file.relativePath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.attachSelection', () => {
      const sel = getSelectedCode();
      if (!sel) {
        vscode.window.showWarningMessage('No code is selected.');
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
        { location: vscode.ProgressLocation.Notification, title: 'Reading project files...' },
        () => scanProject()
      );
      state.attachedContext = buildProjectContext(snapshot);
      panel?.notifyContextAttached(`Entire project (${snapshot.totalFiles} files)`);
    })
  );
}

export function deactivate(): void {}

function handleUserMessage(
  context: vscode.ExtensionContext,
  panel: AdvisorPanel,
  userText: string
): void {
  const contextToSend = state.attachedContext;
  const fullUserMessage = buildUserMessage(userText, contextToSend);

  state.history.push({ role: 'user', content: fullUserMessage });
  if (state.history.length > 20) state.history = state.history.slice(-20);
  if (contextToSend) state.attachedContext = null;

  panel.streamStart();
  let assistantReply = '';

  streamChat(context, state.history, {
    onChunk(chunk) {
      assistantReply += chunk;
      panel.streamChunk(chunk);
    },
    onReplace(fullText) {
      assistantReply = fullText;
      panel.replaceLastMessage(fullText);
    },
    onDone() {
      panel.streamDone();
      state.history.push({ role: 'assistant', content: assistantReply });
    },
    onError(err) {
      panel.showError(err.message);
      state.history.pop();
    },
  });
}
