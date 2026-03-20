import * as vscode from 'vscode';

export type AnalysisMode = 'project' | 'file' | 'selection' | 'idle';

export interface WebviewMessage {
  type: 'ready' | 'setApiKey' | 'analyzeProject' | 'analyzeFile' | 'explainSelection' | 'cancel';
}

/**
 * Manages the sidebar webview panel that displays analysis results.
 */
export class AdvisorPanel {
  private _webview: vscode.Webview;

  constructor(webview: vscode.Webview) {
    this._webview = webview;
    this._webview.options = {
      enableScripts: true,
    };
    this._webview.html = this._getHtml();
  }

  /** Called by extension to stream text into the panel */
  appendText(text: string): void {
    this._webview.postMessage({ type: 'append', text });
  }

  /** Called when streaming is complete */
  done(): void {
    this._webview.postMessage({ type: 'done' });
  }

  /** Show an error message */
  showError(message: string): void {
    this._webview.postMessage({ type: 'error', message });
  }

  /** Show loading state */
  showLoading(message: string): void {
    this._webview.postMessage({ type: 'loading', message });
  }

  /** Reset to idle state */
  reset(): void {
    this._webview.postMessage({ type: 'reset' });
  }

  /** Handle messages coming FROM the webview */
  onMessage(handler: (msg: WebviewMessage) => void): vscode.Disposable {
    return this._webview.onDidReceiveMessage(handler);
  }

  private _getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Let's Do Ourselves</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --accent-hover: var(--vscode-button-hoverBackground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --error: var(--vscode-errorForeground);
      --badge: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --font: var(--vscode-font-family);
      --font-size: var(--vscode-font-size);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: var(--font-size);
      padding: 12px;
      line-height: 1.6;
    }

    h1 {
      font-size: 1.1em;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--fg);
    }

    .tagline {
      font-size: 0.85em;
      opacity: 0.7;
      margin-bottom: 16px;
    }

    .btn-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }

    button {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: 4px;
      padding: 7px 12px;
      cursor: pointer;
      font-size: 0.9em;
      font-family: var(--font);
      text-align: left;
      transition: background 0.15s;
    }

    button:hover:not(:disabled) { background: var(--accent-hover); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }

    button.secondary:hover:not(:disabled) {
      background: var(--input-bg);
    }

    .divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 12px 0;
    }

    #status {
      font-size: 0.82em;
      opacity: 0.75;
      min-height: 1.4em;
      margin-bottom: 8px;
    }

    #output {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.65;
      font-size: 0.9em;
    }

    #output h2 { font-size: 1em; margin-top: 14px; margin-bottom: 4px; }
    #output h3 { font-size: 0.95em; margin-top: 10px; margin-bottom: 3px; }
    #output ul, #output ol { padding-left: 18px; margin: 4px 0; }
    #output li { margin-bottom: 3px; }
    #output strong { font-weight: 700; }

    .cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: var(--fg);
      animation: blink 0.8s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 1px;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    .error {
      color: var(--error);
      font-size: 0.88em;
      padding: 8px;
      border: 1px solid var(--error);
      border-radius: 4px;
    }

    .badge {
      background: var(--badge);
      color: var(--badge-fg);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 0.75em;
      margin-left: 6px;
    }

    .no-key-notice {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 10px;
      font-size: 0.85em;
      margin-bottom: 12px;
    }

    .spinning::after {
      content: '';
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 2px solid var(--accent-fg);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-left: 8px;
      vertical-align: middle;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <h1>Let's Do Ourselves</h1>
  <p class="tagline">AI code advisor — explanations, not code generation</p>

  <div class="btn-row">
    <button id="btn-project" onclick="send('analyzeProject')">
      🔍 Analyze Entire Project
    </button>
    <button id="btn-file" onclick="send('analyzeFile')">
      📄 Analyze Current File
    </button>
    <button id="btn-selection" onclick="send('explainSelection')">
      ❓ Explain Selected Code
    </button>
  </div>

  <hr class="divider" />

  <button class="secondary" onclick="send('setApiKey')" style="font-size:0.82em; padding:5px 10px;">
    🔑 Set OpenAI API Key
  </button>

  <hr class="divider" />

  <div id="status"></div>
  <div id="output"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let isStreaming = false;
    let cursor = null;

    function send(type) {
      vscode.postMessage({ type });
    }

    function setButtons(disabled) {
      ['btn-project', 'btn-file', 'btn-selection'].forEach(id => {
        document.getElementById(id).disabled = disabled;
      });
    }

    function setStatus(text, spinning = false) {
      const el = document.getElementById('status');
      el.textContent = text;
      el.className = spinning ? 'spinning' : '';
    }

    function addCursor() {
      removeCursor();
      cursor = document.createElement('span');
      cursor.className = 'cursor';
      document.getElementById('output').appendChild(cursor);
    }

    function removeCursor() {
      if (cursor) {
        cursor.remove();
        cursor = null;
      }
    }

    // Minimal markdown rendering (headings + bold only; no code blocks)
    function renderMarkdown(raw) {
      return raw
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>(\n|$))+/g, '<ul>$&</ul>');
    }

    let rawBuffer = '';

    window.addEventListener('message', event => {
      const msg = event.data;
      const output = document.getElementById('output');

      switch (msg.type) {
        case 'loading':
          rawBuffer = '';
          output.innerHTML = '';
          setStatus(msg.message, true);
          setButtons(true);
          isStreaming = true;
          break;

        case 'append':
          removeCursor();
          rawBuffer += msg.text;
          output.innerHTML = renderMarkdown(rawBuffer);
          addCursor();
          output.scrollTop = output.scrollHeight;
          break;

        case 'done':
          removeCursor();
          setStatus('Analysis complete.');
          setButtons(false);
          isStreaming = false;
          break;

        case 'error':
          removeCursor();
          output.innerHTML = '<div class="error">' + escapeHtml(msg.message) + '</div>';
          setStatus('');
          setButtons(false);
          isStreaming = false;
          break;

        case 'reset':
          rawBuffer = '';
          output.innerHTML = '';
          setStatus('');
          setButtons(false);
          isStreaming = false;
          removeCursor();
          break;
      }
    });

    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;
  }
}
