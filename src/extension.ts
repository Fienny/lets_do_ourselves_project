import * as vscode from 'vscode';
import { scanProject, scanCurrentFile, getSelectedCode } from './fileScanner';
import { streamAnalysis, setApiKey, getApiKey } from './openaiClient';
import {
  buildProjectAnalysisPrompt,
  buildFileAnalysisPrompt,
  buildSelectionExplainPrompt,
  prepareProjectSnapshot,
} from './analysisEngine';
import { AdvisorPanel } from './webviewPanel';

// ─── Extension activation ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  let panel: AdvisorPanel | null = null;

  // ── Sidebar webview provider ──────────────────────────────────────────────
  const provider = new AdvisorViewProvider(context, (p) => {
    panel = p;
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ldo.advisorView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: "Let's Do Ourselves — OpenAI API Key",
        prompt: 'Enter your OpenAI API key (stored securely in VS Code secret storage)',
        password: true,
        validateInput: (v) => (v.trim().startsWith('sk-') ? null : 'Key should start with "sk-"'),
      });
      if (key) {
        await setApiKey(context, key.trim());
        vscode.window.showInformationMessage("API key saved. Let's Do Ourselves is ready!");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.analyzeProject', () =>
      runAnalysis(context, panel, 'project')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.analyzeFile', () =>
      runAnalysis(context, panel, 'file')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ldo.explainSelection', () =>
      runAnalysis(context, panel, 'selection')
    )
  );

  // ── Prompt for key on first activation if not set ─────────────────────────
  getApiKey(context).then((key) => {
    if (!key) {
      vscode.window
        .showInformationMessage(
          "Let's Do Ourselves needs an OpenAI API key to work.",
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

// ─── Core analysis runner ──────────────────────────────────────────────────────

async function runAnalysis(
  context: vscode.ExtensionContext,
  panel: AdvisorPanel | null,
  mode: 'project' | 'file' | 'selection'
): Promise<void> {
  if (!panel) {
    vscode.window.showWarningMessage(
      "Let's Do Ourselves: please open the advisor panel from the activity bar first."
    );
    // Try to focus the sidebar
    vscode.commands.executeCommand('ldo.advisorView.focus');
    return;
  }

  // Check API key upfront
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    panel.showError(
      'No API key set.\n\nOpen the Command Palette (Ctrl+Shift+P) and run:\n"Let\'s Do Ourselves: Set OpenAI API Key"'
    );
    return;
  }

  let prompt: string;

  try {
    if (mode === 'project') {
      panel.showLoading('Scanning project files...');

      const snapshot = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Let's Do Ourselves",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Reading files...' });
          const raw = await scanProject(progress);
          return prepareProjectSnapshot(raw);
        }
      );

      panel.showLoading(`Analyzing ${snapshot.totalFiles} files with GPT...`);
      prompt = buildProjectAnalysisPrompt(snapshot);
    } else if (mode === 'file') {
      const file = await scanCurrentFile();
      if (!file) {
        panel.showError('No file is currently open in the editor.');
        return;
      }
      panel.showLoading(`Analyzing ${file.relativePath}...`);
      prompt = buildFileAnalysisPrompt(file);
    } else {
      const selection = getSelectedCode();
      if (!selection) {
        panel.showError('Please select some code in the editor first, then try again.');
        return;
      }
      panel.showLoading('Explaining selected code...');
      prompt = buildSelectionExplainPrompt(selection.code, selection.language, selection.filePath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    panel.showError(msg);
    return;
  }

  // Stream the response into the panel
  streamAnalysis(
    context,
    prompt,
    (chunk) => panel.appendText(chunk),
    () => panel.done(),
    (err) => panel.showError(err.message)
  );
}

// ─── Sidebar provider ──────────────────────────────────────────────────────────

class AdvisorViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _onPanel: (panel: AdvisorPanel) => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const panel = new AdvisorPanel(webviewView.webview);
    this._onPanel(panel);

    // Handle messages sent from the webview buttons
    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'analyzeProject':
          vscode.commands.executeCommand('ldo.analyzeProject');
          break;
        case 'analyzeFile':
          vscode.commands.executeCommand('ldo.analyzeFile');
          break;
        case 'explainSelection':
          vscode.commands.executeCommand('ldo.explainSelection');
          break;
        case 'setApiKey':
          vscode.commands.executeCommand('ldo.setApiKey');
          break;
      }
    });
  }
}
