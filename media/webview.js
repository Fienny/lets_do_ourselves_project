(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  let isStreaming = false;
  let streamingEl = null;
  let rawBuffer = '';

  function sendMessage() {
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text || isStreaming) { return; }
    hideEmpty();
    appendUserMessage(text);
    input.value = '';
    autoResize(input);
    vscode.postMessage({ type: 'sendMessage', text: text });
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

  function clearContext() {
    document.getElementById('ctx-bar').classList.remove('visible');
  }

  function clearChat() {
    vscode.postMessage({ type: 'clearChat' });
    const msgs = document.getElementById('messages');
    msgs.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.id = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.textContent = '\uD83E\uDDE0';
    const t1 = document.createElement('div');
    t1.textContent = 'Ask about your code, a bug, a library, or an approach.';
    const t2 = document.createElement('div');
    t2.textContent = 'Attach a file or selection for context.';
    empty.appendChild(icon);
    empty.appendChild(t1);
    empty.appendChild(t2);
    msgs.appendChild(empty);
  }

  function hideEmpty() {
    const el = document.getElementById('empty-state');
    if (el) { el.remove(); }
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
    if (!streamingEl) { return; }
    rawBuffer += text;
    const cursor = streamingEl.querySelector('.cursor');
    streamingEl.innerHTML = renderMarkdown(rawBuffer);
    if (cursor) { streamingEl.appendChild(cursor); }
    scrollBottom();
  }

  function finalizeMentor() {
    if (!streamingEl) { return; }
    const cursor = streamingEl.querySelector('.cursor');
    if (cursor) { cursor.remove(); }
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

  // Minimal markdown renderer: headings, bold, bullet lists.
  // No code block rendering intentionally.
  function renderMarkdown(raw) {
    const lines = raw.split('\n');
    const out = [];
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (/^- /.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + line.slice(2) + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        line = line
          .replace(/^### (.+)$/, '<h3>$1</h3>')
          .replace(/^## (.+)$/,  '<h2>$1</h2>')
          .replace(/^# (.+)$/,   '<h2>$1</h2>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        out.push(line);
      }
    }
    if (inList) { out.push('</ul>'); }
    return out.join('\n');
  }

  // Wire up buttons
  document.getElementById('input').addEventListener('keydown', handleKey);
  document.getElementById('input').addEventListener('input', function () { autoResize(this); });
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('ctx-close').addEventListener('click', clearContext);
  document.getElementById('btn-attach-file').addEventListener('click', attachFile);
  document.getElementById('btn-attach-sel').addEventListener('click', attachSelection);
  document.getElementById('btn-clear').addEventListener('click', clearChat);

  window.addEventListener('message', function (e) {
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
          if (cursor) { streamingEl.appendChild(cursor); }
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
        document.getElementById('ctx-label').textContent = '\uD83D\uDCCE ' + msg.contextInfo;
        document.getElementById('ctx-bar').classList.add('visible');
        hideEmpty();
        break;
    }
  });
}());
