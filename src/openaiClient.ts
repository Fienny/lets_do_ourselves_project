import OpenAI from 'openai';
import * as vscode from 'vscode';

// ─── Mentor Modes ─────────────────────────────────────────────────────────────

export type MentorMode = 'learn' | 'hint' | 'emergency';

export function getModeLabel(mode: MentorMode): string {
  switch (mode) {
    case 'learn':     return '🧠 Learn Mode';
    case 'hint':      return '💡 Hint Mode';
    case 'emergency': return '🚨 Emergency Mode';
  }
}

// ─── Credentials ──────────────────────────────────────────────────────────────

export async function getApiKey(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return ctx.secrets.get('ldo.openaiApiKey');
}
export async function setApiKey(ctx: vscode.ExtensionContext, key: string): Promise<void> {
  await ctx.secrets.store('ldo.openaiApiKey', key);
}

export async function getBackendToken(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return ctx.secrets.get('ldo.backendToken');
}
export async function setBackendToken(ctx: vscode.ExtensionContext, token: string): Promise<void> {
  await ctx.secrets.store('ldo.backendToken', token);
}

// ─── Chat message type ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Streaming callbacks ──────────────────────────────────────────────────────

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onReplace?: (fullText: string) => void;  // when rule engine redacts something
  onDone: () => void;
  onError: (err: Error) => void;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Decides whether to stream from the SaaS backend or directly from OpenAI.
 *
 * Backend mode (production):  set ldo.backendUrl in settings + logged-in token
 * Direct mode (development):  set OpenAI API key in secrets
 */
export async function streamChat(
  context: vscode.ExtensionContext,
  mode: MentorMode,
  history: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<void> {
  const config = vscode.workspace.getConfiguration('ldo');
  const backendUrl: string = config.get('backendUrl', '').trim();

  if (backendUrl) {
    await streamFromBackend(context, backendUrl, mode, history, callbacks);
  } else {
    await streamDirect(context, mode, history, callbacks);
  }
}

// ─── Backend streaming (SaaS mode) ───────────────────────────────────────────

async function streamFromBackend(
  context: vscode.ExtensionContext,
  backendUrl: string,
  mode: MentorMode,
  history: ChatMessage[],
  { onChunk, onReplace, onDone, onError }: StreamCallbacks
): Promise<void> {
  const token = await getBackendToken(context);
  if (!token) {
    onError(new Error(
      'Not logged in.\n\nRun "Let\'s Code Ourselves: Log in" from the Command Palette.'
    ));
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ mode, history }),
    });
  } catch (err: unknown) {
    onError(new Error(`Cannot reach backend at ${backendUrl}: ${String(err)}`));
    return;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      // Quota exceeded — special handling
      if (response.status === 429 && body.detail?.message) {
        onError(new Error(`\u{1F6AB} ${body.detail.message}`));
        return;
      }
      detail = body.detail || detail;
    } catch { /* ignore parse errors */ }
    onError(new Error(`Backend error ${response.status}: ${detail}`));
    return;
  }

  // Parse SSE stream
  const reader = response.body?.getReader();
  if (!reader) { onError(new Error('No response body')); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages (separated by \n\n)
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const eventMatch = part.match(/^event: (\w+)/m);
      const dataMatch  = part.match(/^data: (.+)/m);
      if (!eventMatch || !dataMatch) continue;

      const event = eventMatch[1];
      const data  = dataMatch[1].replace(/\\n/g, '\n'); // unescape newlines

      switch (event) {
        case 'chunk':   onChunk(data); break;
        case 'replace': onReplace?.(data); break;
        case 'done':    onDone(); break;
        case 'error':   onError(new Error(data)); return;
      }
    }
  }
}

// ─── Direct OpenAI streaming (development / no backend) ──────────────────────

const LEARN_PROMPT = `You are "Let's Code Ourselves" — a Socratic coding mentor inside VS Code.

YOUR PHILOSOPHY: Never solve the problem for the developer. Make them solve it themselves.

YOUR METHOD:
- Respond with questions, not answers.
- Ask one focused question at a time.
- Guide toward the insight by making the developer think step by step.
- When they get something right, push one step further.
- When they're wrong, ask a question that makes the problem visible.

ABSOLUTE RULES:
1. NEVER write, generate, or show any code. No code blocks. Ever.
2. NEVER give the direct answer.
3. Keep responses short. One question is often better than five sentences.
4. Be warm, encouraging, and patient.`;

const HINT_PROMPT = `You are "Let's Code Ourselves" — giving a targeted hint.

Give the smallest nudge that unblocks the developer. Point to the concept or built-in they need — not the answer.
Max 3 sentences. End with a question. NEVER write code.`;

const EMERGENCY_PROMPT = `You are "Let's Code Ourselves" — providing direct conceptual guidance.

Explain the concept fully, step by step, in plain English. Be direct and clear.
End with: "Does that make sense? Try implementing it — you've got this."
ABSOLUTE RULE: NEVER write code. Describe logic in plain English only.`;

function getSystemPrompt(mode: MentorMode): string {
  return { learn: LEARN_PROMPT, hint: HINT_PROMPT, emergency: EMERGENCY_PROMPT }[mode];
}

async function streamDirect(
  context: vscode.ExtensionContext,
  mode: MentorMode,
  history: ChatMessage[],
  { onChunk, onDone, onError }: StreamCallbacks
): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    onError(new Error(
      'No API key set.\n\nRun "Let\'s Code Ourselves: Set OpenAI API Key" from the Command Palette.'
    ));
    return;
  }

  const config = vscode.workspace.getConfiguration('ldo');
  const model: string = config.get('openaiModel', 'gpt-4o');
  const client = new OpenAI({ apiKey });

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [{ role: 'system', content: getSystemPrompt(mode) }, ...history],
      max_tokens: 1024,
      temperature: 0.5,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) onChunk(delta);
    }

    onDone();
  } catch (err: unknown) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
