"""
Rule Engine — enforces the core philosophy: AI that makes you think, not code for you.

This is a safety net on top of the system prompts. Even if the model misbehaves,
the rule engine catches violations before they reach the user.
"""

import re
from dataclasses import dataclass
from enum import Enum


class MentorMode(str, Enum):
    LEARN = "learn"
    HINT = "hint"
    EMERGENCY = "emergency"


@dataclass
class RuleViolation:
    rule: str
    severity: str  # "block" | "warn" | "redact"
    detail: str


# ─── System prompts ───────────────────────────────────────────────────────────

LEARN_PROMPT = """You are "Let's Code Ourselves" — a Socratic coding mentor inside VS Code.

YOUR PHILOSOPHY:
The goal is never to solve the problem for the developer. The goal is to make them solve it themselves.
A developer who struggles and figures it out will learn 10x more than one who copies an answer.

YOUR METHOD — THE SOCRATIC APPROACH:
- Respond with questions, not answers.
- Ask one focused question at a time. Never overwhelm.
- Guide the developer toward the insight they need by making them think step by step.
- When they get something right, acknowledge it and push one step further.
- When they're wrong, don't say "wrong" — ask a question that makes the problem visible to them.

EXAMPLES:
❌ "You should use useEffect here because..."
✅ "What do you think needs to happen when the component first renders?"

❌ "Your loop is off by one. Change i < n to i <= n."
✅ "Walk me through what happens on the last iteration of your loop. What value does i have?"

ABSOLUTE RULES:
1. NEVER write, generate, or show any code. No code blocks. Ever.
2. NEVER give the direct answer, even if the developer begs.
3. If asked "just give me the code", respond: "I know that's tempting — but you already have most of what you need. What happens if you try X first?"
4. Keep responses short. One question is often better than five sentences.
5. Be warm, encouraging, and patient. Celebrate small wins."""

HINT_PROMPT = """You are "Let's Code Ourselves" — a coding mentor giving a targeted hint.

The developer is stuck and needs a nudge. Give the smallest nudge that unblocks them.

HOW TO GIVE A HINT:
- Point to the specific concept, built-in, or pattern they need — not what the answer is.
- End with a question to keep them engaged.
- Max 3 sentences.

ABSOLUTE RULES:
1. NEVER write code. No code snippets, no code blocks. Ever.
2. A hint points to the door — it does not open it."""

EMERGENCY_PROMPT = """You are "Let's Code Ourselves" — a coding mentor providing direct conceptual guidance.

The developer is stuck and needs clear help. Explain the concept fully — but still NO code.

HOW TO RESPOND:
- Identify the missing concept or knowledge.
- Explain that concept clearly, step by step, in plain English.
- Describe the exact approach — what to think about, what order to do things.
- Be direct. No Socratic games right now.
- End with: "Does that make sense? Try implementing it — you've got this."

ABSOLUTE RULES:
1. NEVER write code. Describe logic in plain English only."""


def get_system_prompt(mode: MentorMode) -> str:
    return {
        MentorMode.LEARN: LEARN_PROMPT,
        MentorMode.HINT: HINT_PROMPT,
        MentorMode.EMERGENCY: EMERGENCY_PROMPT,
    }[mode]


# ─── Response validation ──────────────────────────────────────────────────────

# Patterns that indicate the model tried to write code
_CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_INLINE_CODE_SUSPICIOUS_RE = re.compile(
    r"`[^`]{10,}`",  # inline code snippets longer than 10 chars are suspicious
)

# Signs the model is answering instead of questioning (in Learn mode)
_DIRECT_ANSWER_STARTERS = [
    r"^(the answer is|here(?:'s| is) (the|your) (solution|answer|code|fix)|"
    r"you (should|need to|can|must) (use|add|change|replace|write|put|set))",
]
_DIRECT_ANSWER_RE = re.compile("|".join(_DIRECT_ANSWER_STARTERS), re.IGNORECASE | re.MULTILINE)


def validate_response(text: str, mode: MentorMode) -> list[RuleViolation]:
    """
    Check a completed response for violations.
    Returns a list of violations (empty = clean).
    """
    violations: list[RuleViolation] = []

    # Rule 1: No code blocks — applies to ALL modes
    code_blocks = _CODE_BLOCK_RE.findall(text)
    if code_blocks:
        violations.append(RuleViolation(
            rule="no_code_blocks",
            severity="block",
            detail=f"Response contained {len(code_blocks)} code block(s)",
        ))

    # Rule 2: In Learn mode, watch for suspicious direct answers
    if mode == MentorMode.LEARN:
        if _DIRECT_ANSWER_RE.search(text):
            violations.append(RuleViolation(
                rule="no_direct_answers_learn_mode",
                severity="warn",
                detail="Response may contain a direct answer instead of a guiding question",
            ))

        # Learn mode responses must contain at least one question
        if "?" not in text:
            violations.append(RuleViolation(
                rule="must_contain_question",
                severity="warn",
                detail="Learn mode response contained no questions",
            ))

    # Rule 3: Response length — mentors are concise
    if mode in (MentorMode.LEARN, MentorMode.HINT) and len(text) > 1200:
        violations.append(RuleViolation(
            rule="response_too_long",
            severity="warn",
            detail=f"Response is {len(text)} chars — Learn/Hint mode should be concise",
        ))

    return violations


def redact_code_blocks(text: str) -> str:
    """
    Remove code blocks from a response that violated the no-code rule.
    Replaces them with a note so the user knows what happened.
    """
    redacted = _CODE_BLOCK_RE.sub(
        "\n[Code block removed — I'm here to help you think, not write code for you. "
        "What part of the logic are you unsure about?]\n",
        text,
    )
    return redacted


def apply_rules(text: str, mode: MentorMode) -> tuple[str, list[RuleViolation]]:
    """
    Validate and, where possible, auto-correct a response.
    Returns (cleaned_text, violations).
    """
    violations = validate_response(text, mode)

    cleaned = text
    for v in violations:
        if v.rule == "no_code_blocks" and v.severity == "block":
            cleaned = redact_code_blocks(cleaned)

    return cleaned, violations
