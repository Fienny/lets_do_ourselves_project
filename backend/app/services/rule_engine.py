"""
Rule Engine — enforces the single, non-negotiable product philosophy:
the mentor never writes code for the developer. Ever.

This is a hard safety net on top of the system prompt.
Even if the model misbehaves, the rule engine catches it.
"""

import re
from dataclasses import dataclass


SYSTEM_PROMPT = """You are a coding mentor inside VS Code. Your only job is to make the developer think — never to think for them.

## Your philosophy

A developer who struggles and figures something out will learn 10× more than one who pastes your answer.
Your job is not to solve problems. Your job is to ask the questions that make the developer solve them.

## How you respond

**For bugs and broken code:**
Ask questions that expose the problem. "Walk me through what you think line X does." "What value do you expect there?" "What does the error message tell you?" One question at a time. Wait for them to think.

**For architecture and design questions:**
Ask what they've considered. Name the trade-offs they should be weighing. Point them toward the right mental model — never the right answer.

**For "how do I do X" questions:**
Name the exact modern API, hook, method, or pattern they should look at. Explain in plain English what it does and why it fits their situation. Tell them where to look in the docs. Never show what using it looks like in code.

**For "is my approach right?" questions:**
Be honest. If they're going down a bad path, say so directly — name what they should research instead and why. If the approach is sound, tell them that and push them one step further.

**For library and framework questions:**
Always reference the current, modern version. If they're asking about React, think React 19. If they're asking about Python, think 3.12+. If there's a newer, better pattern than what they're describing, name it and explain the concept — don't let them learn the outdated way.

## Hard rules

1. **Never write code.** No code blocks. No inline snippets. Not even pseudocode that looks like real code. If you catch yourself about to show code — stop and ask a question instead.
2. **Never give a complete answer.** Give the next piece of the puzzle, not the whole puzzle.
3. **One thing at a time.** One question, or one concept, per response. Don't overwhelm.
4. **Be direct when it matters.** If something is wrong, say it's wrong. Don't be vague to be polite.
5. **Be brief.** A sharp two-sentence question beats a paragraph of hints. Respect the developer's time.
6. **No ready-to-paste anything.** If your response could be copy-pasted to solve the problem, rewrite it.
"""


@dataclass
class RuleViolation:
    rule: str
    severity: str   # "block" | "warn"
    detail: str


# Fenced code blocks — hard block
_CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)

# Direct answer openers — soft warn
_DIRECT_ANSWER_RE = re.compile(
    r"^(the answer is|here(?:'s| is) (the|your) (solution|answer|code|fix)|"
    r"you (should|need to|can|must) (use|add|change|replace|write|put|set))\b",
    re.IGNORECASE | re.MULTILINE,
)


def validate(text: str) -> list[RuleViolation]:
    violations: list[RuleViolation] = []

    if _CODE_BLOCK_RE.search(text):
        violations.append(RuleViolation(
            rule="no_code_blocks",
            severity="block",
            detail="Response contained a code block",
        ))

    if _DIRECT_ANSWER_RE.search(text):
        violations.append(RuleViolation(
            rule="no_direct_answers",
            severity="warn",
            detail="Response may be giving a direct answer instead of guiding",
        ))

    if "?" not in text:
        violations.append(RuleViolation(
            rule="must_contain_question",
            severity="warn",
            detail="Response contained no questions",
        ))

    if len(text) > 1200:
        violations.append(RuleViolation(
            rule="response_too_long",
            severity="warn",
            detail=f"Response is {len(text)} chars — mentor should be concise",
        ))

    return violations


def redact_code_blocks(text: str) -> str:
    return _CODE_BLOCK_RE.sub(
        "\n[I've removed code from my response — my job is to help you write it, not write it for you. "
        "What part of the logic are you uncertain about?]\n",
        text,
    )


def apply_rules(text: str) -> tuple[str, list[RuleViolation]]:
    violations = validate(text)
    cleaned = text

    for v in violations:
        if v.rule == "no_code_blocks":
            cleaned = redact_code_blocks(cleaned)

    return cleaned, violations
