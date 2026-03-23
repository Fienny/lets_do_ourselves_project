import * as vscode from 'vscode';

export interface WebviewIncomingMessage {
  type: 'sendMessage' | 'clearChat' | 'attachFile' | 'attachSelection';
  text?: string;
}

export interface WebviewOutgoingMessage {
  type: 'streamStart' | 'streamChunk' | 'streamDone' | 'replaceMessage' | 'error' | 'contextAttached';
  text?: string;
  contextInfo?: string;
}

export class AdvisorPanel {
  private _webview: vscode.Webview;

  constructor(webview: vscode.Webview, extensionUri: vscode.Uri) {
    this._webview = webview;
    this._webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    };
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'webview.js')
    );
    this._webview.html = this._getHtml(scriptUri, webview.cspSource);
  }

  post(msg: WebviewOutgoingMessage): void { this._webview.postMessage(msg); }
  streamStart(): void                     { this.post({ type: 'streamStart' }); }
  streamChunk(text: string): void         { this.post({ type: 'streamChunk', text }); }
  streamDone(): void                      { this.post({ type: 'streamDone' }); }
  replaceLastMessage(text: string): void  { this.post({ type: 'replaceMessage', text }); }
  showError(message: string): void        { this.post({ type: 'error', text: message }); }
  notifyContextAttached(info: string): void { this.post({ type: 'contextAttached', contextInfo: info }); }

  onMessage(handler: (msg: WebviewIncomingMessage) => void): vscode.Disposable {
    return this._webview.onDidReceiveMessage(handler);
  }

  private _getHtml(scriptUri: vscode.Uri, cspSource: string): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${cspSource};" />
  <title>Let's Code Ourselves</title>
  <style>
    :root {
      --bg:        var(--vscode-editor-background);
      --fg:        var(--vscode-editor-foreground);
      --border:    var(--vscode-panel-border);
      --accent:    var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --accent-h:  var(--vscode-button-hoverBackground);
      --input-bg:  var(--vscode-input-background);
      --input-fg:  var(--vscode-input-foreground);
      --input-bd:  var(--vscode-input-border);
      --user-bg:   var(--vscode-badge-background);
      --user-fg:   var(--vscode-badge-foreground);
      --mentor-bg: var(--vscode-editor-inactiveSelectionBackground);
      --error:     var(--vscode-errorForeground);
      --font:      var(--vscode-font-family);
      --font-sz:   var(--vscode-font-size);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: var(--font-sz);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header h1 { font-size: 1em; font-weight: 700; }
    .header p  { font-size: 0.78em; opacity: 0.55; margin-top: 2px; }

    .context-bar {
      padding: 5px 12px;
      font-size: 0.78em;
      background: var(--input-bg);
      border-bottom: 1px solid var(--border);
      display: none;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .context-bar.visible { display: flex; }
    .context-bar button {
      background: transparent;
      border: none;
      color: var(--fg);
      cursor: pointer;
      opacity: 0.6;
      padding: 0 3px;
    }
    .context-bar button:hover { opacity: 1; }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .msg {
      max-width: 92%;
      padding: 8px 11px;
      border-radius: 10px;
      line-height: 1.55;
      font-size: 0.9em;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--user-bg);
      color: var(--user-fg);
      border-bottom-right-radius: 3px;
    }
    .msg.mentor {
      align-self: flex-start;
      background: var(--mentor-bg);
      border-bottom-left-radius: 3px;
    }
    .msg.mentor h2, .msg.mentor h3 { font-size: 0.95em; margin: 6px 0 2px; }
    .msg.mentor strong { font-weight: 700; }
    .msg.mentor ul, .msg.mentor ol { padding-left: 16px; margin: 4px 0; }
    .msg.mentor li { margin-bottom: 2px; }
    .msg.error {
      align-self: stretch;
      background: transparent;
      border: 1px solid var(--error);
      color: var(--error);
      font-size: 0.82em;
      border-radius: 6px;
    }

    .cursor {
      display: inline-block;
      width: 2px;
      height: 0.9em;
      background: var(--fg);
      animation: blink 0.7s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 1px;
    }
    @keyframes blink { 50% { opacity: 0; } }

    .empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0.4;
      font-size: 0.85em;
      text-align: center;
      gap: 8px;
      padding: 20px;
    }
    .empty-icon { font-size: 2em; }

    .input-area {
      border-top: 1px solid var(--border);
      padding: 8px 10px;
      flex-shrink: 0;
    }
    .input-row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    textarea {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-bd);
      border-radius: 6px;
      padding: 7px 9px;
      font-family: var(--font);
      font-size: 0.9em;
      resize: none;
      min-height: 36px;
      max-height: 120px;
      line-height: 1.4;
    }
    textarea:focus { outline: 1px solid var(--accent); }
    .send-btn {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: 6px;
      padding: 7px 13px;
      cursor: pointer;
      font-size: 0.9em;
      height: 36px;
      flex-shrink: 0;
    }
    .send-btn:hover:not(:disabled) { background: var(--accent-h); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .action-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .action-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 4px;
      padding: 3px 9px;
      font-size: 0.78em;
      cursor: pointer;
      font-family: var(--font);
      opacity: 0.7;
    }
    .action-btn:hover { opacity: 1; background: var(--input-bg); }
  </style>
</head>
<body>
  <div class="header">
    <h1>Let's Code Ourselves</h1>
    <p>Ask me anything. I'll make you think, not copy.</p>
  </div>

  <div class="context-bar" id="ctx-bar">
    <span id="ctx-label"></span>
    <button id="ctx-close" title="Remove context">&#x2715;</button>
  </div>

  <div class="messages" id="messages">
    <div class="empty" id="empty-state">
      <div class="empty-icon">&#x1F9E0;</div>
      <div>Ask about your code, a bug, a library, or an approach.</div>
      <div>Attach a file or selection for context.</div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-row">
      <textarea id="input" placeholder="What are you working on?" rows="1"></textarea>
      <button class="send-btn" id="send-btn">Send</button>
    </div>
    <div class="action-row">
      <button class="action-btn" id="btn-attach-file">&#x1F4C4; Attach file</button>
      <button class="action-btn" id="btn-attach-sel">&#x2702; Attach selection</button>
      <button class="action-btn" id="btn-clear">&#x1F5D1; Clear</button>
    </div>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
