import * as vscode from 'vscode';
import { MentorMode, getModeLabel, ChatMessage } from './openaiClient';

export interface WebviewIncomingMessage {
  type: 'sendMessage' | 'setMode' | 'setApiKey' | 'clearChat' | 'attachFile' | 'attachSelection';
  text?: string;
  mode?: MentorMode;
}

export interface WebviewOutgoingMessage {
  type: 'streamStart' | 'streamChunk' | 'streamDone' | 'error' | 'modeChanged' | 'contextAttached';
  text?: string;
  mode?: MentorMode;
  modeLabel?: string;
  contextInfo?: string;
}

/**
 * Manages the sidebar chat panel.
 */
export class AdvisorPanel {
  private _webview: vscode.Webview;

  constructor(webview: vscode.Webview) {
    this._webview = webview;
    this._webview.options = { enableScripts: true };
    this._webview.html = this._getHtml();
  }

  post(msg: WebviewOutgoingMessage): void {
    this._webview.postMessage(msg);
  }

  streamStart(): void {
    this.post({ type: 'streamStart' });
  }

  streamChunk(text: string): void {
    this.post({ type: 'streamChunk', text });
  }

  streamDone(): void {
    this.post({ type: 'streamDone' });
  }

  showError(message: string): void {
    this.post({ type: 'error', text: message });
  }

  notifyModeChanged(mode: MentorMode): void {
    this.post({ type: 'modeChanged', mode, modeLabel: getModeLabel(mode) });
  }

  notifyContextAttached(info: string): void {
    this.post({ type: 'contextAttached', contextInfo: info });
  }

  onMessage(handler: (msg: WebviewIncomingMessage) => void): vscode.Disposable {
    return this._webview.onDidReceiveMessage(handler);
  }

  private _getHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Let's Code Ourselves</title>
  <style>
    :root {
      --bg:          var(--vscode-editor-background);
      --fg:          var(--vscode-editor-foreground);
      --border:      var(--vscode-panel-border);
      --accent:      var(--vscode-button-background);
      --accent-fg:   var(--vscode-button-foreground);
      --accent-h:    var(--vscode-button-hoverBackground);
      --input-bg:    var(--vscode-input-background);
      --input-fg:    var(--vscode-input-foreground);
      --input-bd:    var(--vscode-input-border);
      --user-bg:     var(--vscode-badge-background);
      --user-fg:     var(--vscode-badge-foreground);
      --mentor-bg:   var(--vscode-editor-inactiveSelectionBackground);
      --error:       var(--vscode-errorForeground);
      --font:        var(--vscode-font-family);
      --font-sz:     var(--vscode-font-size);
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

    /* ── Header ── */
    .header {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header h1 { font-size: 1em; font-weight: 700; margin-bottom: 6px; }
    .mode-row { display: flex; gap: 4px; flex-wrap: wrap; }
    .mode-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 12px;
      padding: 3px 10px;
      font-size: 0.78em;
      cursor: pointer;
      font-family: var(--font);
      transition: all 0.15s;
      opacity: 0.7;
    }
    .mode-btn:hover { opacity: 1; background: var(--input-bg); }
    .mode-btn.active {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
      opacity: 1;
    }

    /* ── Context badge ── */
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
      font-size: 0.9em;
      padding: 0 3px;
    }
    .context-bar button:hover { opacity: 1; }

    /* ── Chat messages ── */
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
    .msg.mentor h2 { font-size: 0.95em; margin: 8px 0 3px; }
    .msg.mentor h3 { font-size: 0.9em; margin: 6px 0 2px; }
    .msg.mentor strong { font-weight: 700; }
    .msg.mentor ul, .msg.mentor ol { padding-left: 16px; margin: 4px 0; }
    .msg.mentor li { margin-bottom: 2px; }
    .msg.error {
      align-self: stretch;
      background: transparent;
      border: 1px solid var(--error);
      color: var(--error);
      font-size: 0.82em;
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

    /* ── Empty state ── */
    .empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0.45;
      font-size: 0.88em;
      text-align: center;
      gap: 8px;
      padding: 20px;
    }
    .empty-icon { font-size: 2em; }

    /* ── Input area ── */
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
      transition: background 0.15s;
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
      opacity: 0.75;
    }
    .action-btn:hover { opacity: 1; background: var(--input-bg); }
  </style>
</head>
<body>
  <!-- Header with mode switcher -->
  <div class="header">
    <h1>Let's Code Ourselves</h1>
    <div class="mode-row">
      <button class="mode-btn active" data-mode="learn"  onclick="setMode('learn')">🧠 Learn</button>
      <button class="mode-btn"        data-mode="hint"   onclick="setMode('hint')">💡 Hint</button>
      <button class="mode-btn"        data-mode="emergency" onclick="setMode('emergency')">🚨 Emergency</button>
    </div>
  </div>

  <!-- Context indicator (shown when file/selection is attached) -->
  <div class="context-bar" id="ctx-bar">
    <span id="ctx-label">📎 No context</span>
    <button onclick="clearContext()" title="Remove context">✕</button>
  </div>

  <!-- Messages -->
  <div class="messages" id="messages">
    <div class="empty" id="empty-state">
      <div class="empty-icon">🧠</div>
      <div><strong>Ask me about your code.</strong></div>
      <div>I won't give you answers — I'll help you find them yourself.</div>
    </div>
  </div>

  <!-- Input -->
  <div class="input-area">
    <div class="input-row">
      <textarea
        id="input"
        placeholder="Ask a question about your code..."
        rows="1"
        onkeydown="handleKey(event)"
        oninput="autoResize(this)"
      ></textarea>
      <button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>
    </div>
    <div class="action-row">
      <button class="action-btn" onclick="attachFile()">📄 Attach current file</button>
      <button class="action-btn" onclick="attachSelection()">✂️ Attach selection</button>
      <button class="action-btn" onclick="clearChat()">🗑 Clear chat</button>
      <button class="action-btn" onclick="setApiKey()">🔑 API Key</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let isStreaming = false;
    let currentMode = 'learn';
    let streamingEl = null;
    let rawBuffer = '';

    // ── Send ──────────────────────────────────────────────────────────────────
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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    // ── Mode ──────────────────────────────────────────────────────────────────
    function setMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      vscode.postMessage({ type: 'setMode', mode });
    }

    // ── Context ───────────────────────────────────────────────────────────────
    function attachFile()      { vscode.postMessage({ type: 'attachFile' }); }
    function attachSelection() { vscode.postMessage({ type: 'attachSelection' }); }
    function clearContext() {
      document.getElementById('ctx-bar').classList.remove('visible');
      vscode.postMessage({ type: 'attachFile', clear: true });
    }

    function setApiKey() { vscode.postMessage({ type: 'setApiKey' }); }
    function clearChat() { vscode.postMessage({ type: 'clearChat' }); }

    // ── DOM helpers ───────────────────────────────────────────────────────────
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
      cursor.id = 'stream-cursor';
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

    function scrollBottom() {
      const msgs = document.getElementById('messages');
      msgs.scrollTop = msgs.scrollHeight;
    }

    function setStreaming(val) {
      isStreaming = val;
      document.getElementById('send-btn').disabled = val;
      document.getElementById('input').disabled = val;
    }

    // Minimal markdown: headings, bold, lists — NO code blocks
    function renderMarkdown(raw) {
      return raw
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[^]*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
    }

    // ── Message handler ───────────────────────────────────────────────────────
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
        case 'streamDone':
          finalizeMentor();
          setStreaming(false);
          break;
        case 'error':
          finalizeMentor();
          showError(msg.text);
          setStreaming(false);
          break;
        case 'modeChanged':
          // Sync mode buttons if changed from outside
          document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === msg.mode);
          });
          currentMode = msg.mode;
          break;
        case 'contextAttached':
          const bar = document.getElementById('ctx-bar');
          const label = document.getElementById('ctx-label');
          label.textContent = '📎 ' + msg.contextInfo;
          bar.classList.add('visible');
          hideEmpty();
          break;
        case 'clearChat':
          document.getElementById('messages').innerHTML =
            '<div class="empty" id="empty-state"><div class="empty-icon">🧠</div>' +
            '<div><strong>Ask me about your code.</strong></div>' +
            '<div>I won\'t give you answers — I\'ll help you find them yourself.</div></div>';
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
