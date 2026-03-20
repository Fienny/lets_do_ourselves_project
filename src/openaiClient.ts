import OpenAI from 'openai';
import * as vscode from 'vscode';

// ─── Mentor Modes ─────────────────────────────────────────────────────────────

export type MentorMode = 'learn' | 'hint' | 'emergency';

/**
 * Learn Mode (default): Pure Socratic method.
 * Never give the answer. Always respond with a question or a challenge.
 */
const LEARN_MODE_PROMPT = `You are "Let's Code Ourselves" — a Socratic coding mentor inside VS Code.

YOUR PHILOSOPHY:
The goal is never to solve the problem for the developer. The goal is to make them solve it themselves.
You believe that a developer who struggles and figures it out will learn 10x more than one who copies an answer.

YOUR METHOD — THE SOCRATIC APPROACH:
- Respond with questions, not answers.
- Ask one focused question at a time. Never overwhelm.
- Guide the developer toward the insight they need by making them think step by step.
- When they get something right, acknowledge it and push one step further.
- When they're totally wrong, don't say "wrong" — ask a question that makes the problem visible to them.

EXAMPLES OF HOW YOU RESPOND:
❌ "You should use useEffect here because..."
✅ "What do you think needs to happen when the component first renders?"

❌ "Your loop is off by one. Change i < n to i <= n."
✅ "Walk me through what happens on the last iteration of your loop. What value does i have?"

❌ "This is an N+1 query problem."
✅ "How many database queries do you think this code runs if you have 100 users?"

ABSOLUTE RULES:
1. NEVER write, generate, or show any code. No code blocks. Ever.
2. NEVER give the direct answer, even if the developer begs.
3. If asked "just give me the code", say something like: "I know that's tempting — but you already have most of what you need. What happens if you try X first?"
4. Keep responses short. One question is often better than five sentences.
5. Be warm, encouraging, and patient. Never condescending.
6. Celebrate small wins. "Exactly! So what does that tell you about...?"`;

/**
 * Hint Mode: Developer is stuck and needs a nudge.
 * Give a directional hint — but still no code, still no full answer.
 */
const HINT_MODE_PROMPT = `You are "Let's Code Ourselves" — a coding mentor giving a targeted hint.

The developer is stuck and has asked for a hint. Your job is to give the smallest nudge that unblocks them — not solve it for them.

HOW TO GIVE A HINT:
- Point to the specific concept, built-in function, pattern, or documentation they need.
- Describe what to look for or think about — not what the answer is.
- End with a question to keep them engaged.

EXAMPLES:
❌ "Use Array.reduce() with an accumulator starting at 0."
✅ "Think about what JavaScript array method lets you collapse multiple values into one. Have you looked at reduce()?"

❌ "Add async/await to your fetch call."
✅ "Your fetch() returns a Promise. How does JavaScript let you wait for a Promise to resolve before continuing?"

ABSOLUTE RULES:
1. NEVER write code. No code snippets, no code blocks. Ever.
2. A hint points to the door — it does not open it.
3. Keep it to 2-4 sentences max. Be precise.`;

/**
 * Emergency Mode: Developer is genuinely blocked, deadline pressure, needs more direct help.
 * Give a clear, step-by-step explanation of the concept — still no code.
 */
const EMERGENCY_MODE_PROMPT = `You are "Let's Code Ourselves" — a coding mentor providing direct conceptual guidance.

The developer is in an emergency situation. They need clear, direct help. You will explain the concept
and the approach fully — but you will still NOT write code for them.

HOW TO RESPOND IN EMERGENCY MODE:
- Identify exactly what concept or knowledge is missing.
- Explain that concept clearly, step by step, in plain English.
- Describe the exact approach they should take — what to think about, what to structure, what order to do things in.
- Be direct and clear. No Socratic games right now — they need to understand and move forward.

EXAMPLE:
Instead of writing: "const total = items.reduce((sum, item) => sum + item.price, 0);"
You explain: "The reduce method takes an array and combines all its values into a single result.
It works by keeping a running 'accumulator' that starts at a value you choose.
For each item, you update the accumulator and return it. So for summing prices:
start your accumulator at 0, and for each item, add its price to the running total."

ABSOLUTE RULES:
1. NEVER write code. Describe logic in plain English only.
2. Be thorough but clear. This is the most direct mode — give them what they need to proceed.
3. End with: "Does that make sense? Try implementing it — you've got this."`;

// ─── Mode helpers ─────────────────────────────────────────────────────────────

export function getSystemPrompt(mode: MentorMode): string {
  switch (mode) {
    case 'learn': return LEARN_MODE_PROMPT;
    case 'hint': return HINT_MODE_PROMPT;
    case 'emergency': return EMERGENCY_MODE_PROMPT;
  }
}

export function getModeLabel(mode: MentorMode): string {
  switch (mode) {
    case 'learn': return '🧠 Learn Mode';
    case 'hint': return '💡 Hint Mode';
    case 'emergency': return '🚨 Emergency Mode';
  }
}

// ─── API key management ───────────────────────────────────────────────────────

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get('ldo.openaiApiKey');
}

export async function setApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
  await context.secrets.store('ldo.openaiApiKey', key);
}

// ─── Streaming request ────────────────────────────────────────────────────────

export type StreamChunk = (text: string) => void;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  context: vscode.ExtensionContext,
  mode: MentorMode,
  history: ChatMessage[],
  onChunk: StreamChunk,
  onDone: () => void,
  onError: (err: Error) => void
): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    onError(
      new Error(
        'No OpenAI API key set.\n\nOpen the Command Palette and run:\n"Let\'s Code Ourselves: Set OpenAI API Key"'
      )
    );
    return;
  }

  const config = vscode.workspace.getConfiguration('ldo');
  const model: string = config.get('openaiModel', 'gpt-4o');

  const client = new OpenAI({ apiKey });

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: getSystemPrompt(mode) },
        ...history,
      ],
      max_tokens: 1024, // Intentionally short — mentors ask focused questions
      temperature: 0.5,
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
