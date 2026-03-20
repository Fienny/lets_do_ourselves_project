import OpenAI from 'openai';
import * as vscode from 'vscode';

// ─── System Prompt ────────────────────────────────────────────────────────────
// This is the core guardrail: the AI is a teacher, never a code writer.
const SYSTEM_PROMPT = `You are "Let's Do Ourselves" — an expert software engineering mentor and code advisor built into VSCode.

YOUR ROLE:
- Analyze code and project structure to identify problems, anti-patterns, and deviations from best practices.
- Explain issues clearly in plain language, as if talking to a developer who wants to understand and grow.
- Suggest concrete steps and approaches to fix problems — in words, not code.
- Praise what is done well, so the developer learns to recognize good practices.

STRICT RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:
1. NEVER write, generate, produce, or output any code snippets, functions, classes, or configuration files.
2. NEVER use markdown code blocks (\`\`\`). Ever.
3. If asked to write code, firmly but kindly decline and redirect to explaining the concept instead.
4. Use simple, friendly language. Avoid jargon without explaining it first.
5. Structure your responses with clear headings and bullet points.
6. Always explain the "why" behind every suggestion — understanding beats copy-pasting.

WHAT YOU CAN DO:
- Explain what a pattern, concept, or tool is and why it matters.
- Describe folder/file structure best practices for the detected tech stack.
- Point out naming conventions, separation of concerns, coupling issues, missing patterns.
- Walk through a problem step by step in plain English.
- Suggest what to search for, what to read, or what to rename/move/split.

TONE: Encouraging, direct, educational. Like a senior developer doing a thorough, kind code review.`;

// ─── Streaming callback type ───────────────────────────────────────────────────
export type StreamChunk = (text: string) => void;

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientInstance) {
    return clientInstance;
  }

  const secrets = (vscode.extensions.getExtension('lets-do-ourselves.lets-do-ourselves') as any)
    ?._secretStorage;
  // Client is created fresh each time so key changes take effect immediately
  throw new Error('Use createClientWithKey() instead of getClient() directly.');
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get('ldo.openaiApiKey');
}

export async function setApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
  await context.secrets.store('ldo.openaiApiKey', key);
  clientInstance = null; // reset so next call picks up new key
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

// ─── Core streaming request ────────────────────────────────────────────────────

export async function streamAnalysis(
  context: vscode.ExtensionContext,
  userPrompt: string,
  onChunk: StreamChunk,
  onDone: () => void,
  onError: (err: Error) => void
): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    onError(
      new Error(
        'No OpenAI API key found. Run "Let\'s Do Ourselves: Set OpenAI API Key" from the Command Palette.'
      )
    );
    return;
  }

  const config = vscode.workspace.getConfiguration('ldo');
  const model: string = config.get('openaiModel', 'gpt-4o');
  const language: string = config.get('language', 'English');

  const client = createClient(apiKey);

  const fullPrompt =
    language !== 'English'
      ? `${userPrompt}\n\n[Please respond in ${language}.]`
      : userPrompt;

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: fullPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.4, // lower = more consistent, factual responses
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
      }
    }

    onDone();
  } catch (err: unknown) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
