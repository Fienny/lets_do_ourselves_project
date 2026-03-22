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

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class AdvisorPanel {
  private _webview: vscode.Webview;

  constructor(webview: vscode.Webview) {
    this._webview = webview;
    this._webview.options = { enableScripts: true };
    this._webview.html = this._getHtml(getNonce());
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

  private _getHtml(nonce: string): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
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
    <button id="ctx-close" title="Remove context">✕</button>
  </div>

  <div class="messages" id="messages">
    <div class="empty" id="empty-state">
      <div class="empty-icon">🧠</div>
      <div>Ask about your code, a bug, a library, or an approach.</div>
      <div>Attach a file or selection for context.</div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-row">
      <textarea
        id="input"
        placeholder="What are you working on?"
        rows="1"
      ></textarea>
      <button class="send-btn" id="send-btn">Send</button>
    </div>
    <div class="action-row">
      <button class="action-btn" id="btn-attach-file">📄 Attach file</button>
      <button class="action-btn" id="btn-attach-sel">✂️ Attach selection</button>
      <button class="action-btn" id="btn-clear">🗑 Clear</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let isStreaming = false;
    let streamingEl = null;
    let rawBuffer = '';

    function sendMessage() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text || isStreaming) return;
      hideEmpty();
      appendUserMessage(text);
      input.value = '';
      autoResize(input);
      vscode.postMessage({ type: 'sendMessage', text });
    }

    function handleKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function attachFile()      { vscode.postMessage({ type: 'attachFile' }); }
    function attachSelection() { vscode.postMessage({ type: 'attachSelection' }); }
    function clearContext()    {
      document.getElementById('ctx-bar').classList.remove('visible');
    }
    function clearChat() {
      vscode.postMessage({ type: 'clearChat' });
      document.getElementById('messages').innerHTML =
        '<div class="empty" id="empty-state">' +
        '<div class="empty-icon">🧠</div>' +
        '<div>Ask about your code, a bug, a library, or an approach.</div>' +
        '<div>Attach a file or selection for context.</div>' +
        '</div>';
    }

    function hideEmpty() {
      const el = document.getElementById('empty-state');
      if (el) el.remove();
    }

    function appendUserMessage(text) {
      const msgs = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg user';
      div.textContent = text;
      msgs.appendChild(div);
      scrollBottom();
    }

    function startMentorMessage() {
      const msgs = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg mentor';
      rawBuffer = '';
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      div.appendChild(cursor);
      msgs.appendChild(div);
      streamingEl = div;
      scrollBottom();
    }

    function appendToMentor(text) {
      if (!streamingEl) return;
      rawBuffer += text;
      const cursor = streamingEl.querySelector('.cursor');
      streamingEl.innerHTML = renderMarkdown(rawBuffer);
      if (cursor) streamingEl.appendChild(cursor);
      scrollBottom();
    }

    function finalizeMentor() {
      if (!streamingEl) return;
      const cursor = streamingEl.querySelector('.cursor');
      if (cursor) cursor.remove();
      streamingEl = null;
    }

    function showError(message) {
      const msgs = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg error';
      div.textContent = message;
      msgs.appendChild(div);
      scrollBottom();
    }

    function setStreaming(val) {
      isStreaming = val;
      document.getElementById('send-btn').disabled = val;
      document.getElementById('input').disabled = val;
    }

    function scrollBottom() {
      const msgs = document.getElementById('messages');
      msgs.scrollTop = msgs.scrollHeight;
    }

    // Minimal markdown: headings, bold, lists — intentionally no code block rendering
    function renderMarkdown(raw) {
      return raw
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
        .replace(/^# (.+)$/gm,   '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[^]*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
    }

    // Wire up all buttons with addEventListener (no inline onclick)
    try {
      const inputEl = document.getElementById('input');
      inputEl.addEventListener('keydown', handleKey);
      inputEl.addEventListener('input', function() { autoResize(this); });
      document.getElementById('send-btn').addEventListener('click', sendMessage);
      document.getElementById('ctx-close').addEventListener('click', clearContext);
      document.getElementById('btn-attach-file').addEventListener('click', attachFile);
      document.getElementById('btn-attach-sel').addEventListener('click', attachSelection);
      document.getElementById('btn-clear').addEventListener('click', clearChat);
      console.log('[LDO] Event listeners registered OK');
    } catch (err) {
      console.error('[LDO] Failed to register event listeners:', err);
      document.getElementById('messages').innerHTML =
        '<div class="msg error" style="margin:12px">JS error: ' + err.message + '</div>';
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      switch (msg.type) {
        case 'streamStart':
          setStreaming(true);
          startMentorMessage();
          break;
        case 'streamChunk':
          appendToMentor(msg.text);
          break;
        case 'replaceMessage':
          if (streamingEl) {
            rawBuffer = msg.text || '';
            const cursor = streamingEl.querySelector('.cursor');
            streamingEl.innerHTML = renderMarkdown(rawBuffer);
            if (cursor) streamingEl.appendChild(cursor);
            scrollBottom();
          }
          break;
        case 'streamDone':
          finalizeMentor();
          setStreaming(false);
          break;
        case 'error':
          finalizeMentor();
          showError(msg.text);
          setStreaming(false);
          break;
        case 'contextAttached':
          document.getElementById('ctx-label').textContent = '📎 ' + msg.contextInfo;
          document.getElementById('ctx-bar').classList.add('visible');
          hideEmpty();
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
