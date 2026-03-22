import * as vscode from 'vscode';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onReplace?: (fullText: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export async function streamChat(
  context: vscode.ExtensionContext,
  history: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<void> {
  const config = vscode.workspace.getConfiguration('ldo');
  const backendUrl: string = config.get('backendUrl', '').trim();

  if (!backendUrl) {
    callbacks.onError(new Error(
      'No backend URL configured.\n\nSet "ldo.backendUrl" in VS Code settings to point at your running backend.'
    ));
    return;
  }

  const { onChunk, onReplace, onDone, onError } = callbacks;

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history }),
    });
  } catch (err: unknown) {
    onError(new Error(`Cannot reach backend at ${backendUrl}. Is it running?\n${String(err)}`));
    return;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch { /* ignore */ }
    onError(new Error(`Backend error ${response.status}: ${detail}`));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) { onError(new Error('No response body from backend')); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const eventMatch = part.match(/^event: (\w+)/m);
      const dataMatch  = part.match(/^data: (.+)/ms);
      if (!eventMatch || !dataMatch) continue;

      const event = eventMatch[1];
      const data  = dataMatch[1].replace(/\\n/g, '\n');

      switch (event) {
        case 'chunk':   onChunk(data); break;
        case 'replace': onReplace?.(data); break;
        case 'done':    onDone(); return;
        case 'error':   onError(new Error(data)); return;
      }
    }
  }
}
