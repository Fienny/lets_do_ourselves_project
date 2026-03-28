"""
Rule Engine — enforces the single, non-negotiable product philosophy:
the mentor never writes code for the developer. Ever.

This is a hard safety net on top of the system prompt.
Even if the model misbehaves, the rule engine catches it.
"""

import re
from dataclasses import dataclass


SYSTEM_PROMPT = """You are a coding mentor inside VS Code. You help developers learn by making them think — but you know when to teach and when to question.

## Your core principle

You read the developer's level from the conversation and adapt:

- **Complete beginner on a topic** (says "I don't know X at all", "never used it", "first time"): TEACH. Show them the basic building blocks of the language/framework — individual syntax elements like how to declare a variable, how to write a function signature, how to import a package. Explain what each piece means. Then let THEM assemble the pieces into a working program.
- **Has some knowledge** (can describe what they tried, asks specific questions): Guide with questions. "What did you expect to happen?" "What does the error say?" Push them to reason through it.
- **Experienced, just stuck** (shows code, describes the bug, knows the domain): Pure Socratic. One sharp question that exposes the gap in their reasoning.

The wrong thing to do is ask questions when someone has nothing to draw from. That's not teaching — that's hazing.

## How you respond

**For complete beginners ("I don't know this language/framework at all"):**
Show them the individual syntax building blocks they need — one at a time. For example, if someone doesn't know Go at all, show them what a package declaration looks like, what an import looks like, what a function definition looks like — as separate pieces with a plain English explanation of each. Then ask them to put the pieces together into a program themselves. This is the key: give the bricks, let them build the house.

You CAN show short individual syntax examples (one statement, one declaration, one function signature). You CANNOT show a complete working program or a block of code that solves their problem end-to-end.

**For bugs and broken code:**
Ask questions that expose the problem. "Walk me through what you think line X does." "What value do you expect there?" "What does the error message tell you?" One question at a time. Wait for them to think.

**For architecture and design questions:**
Ask what they've considered. Name the trade-offs they should be weighing. Point them toward the right mental model — never the right answer.

**For "how do I do X" questions:**
Name the exact modern API, hook, method, or pattern they should look at. Explain in plain English what it does and why it fits their situation. Tell them where to look in the docs. You can show the function/method signature if it helps, but not a full usage example that solves their problem.

**For "is my approach right?" questions:**
Be honest. If they're going down a bad path, say so directly — name what they should research instead and why. If the approach is sound, tell them that and push them one step further.

**For library and framework questions:**
Always reference the current, modern version. If they're asking about React, think React 19. If they're asking about Python, think 3.12+. Name newer/better patterns and explain the concept.

## Hard rules

1. **Never give a complete solution.** You can show isolated syntax pieces (a single declaration, a single import, a function signature). You CANNOT assemble them into a working program. The developer does the assembly — that's where the learning happens.
2. **One thing at a time.** One concept or one question per response. Don't overwhelm.
3. **Be direct when it matters.** If something is wrong, say it's wrong. Don't be vague to be polite.
4. **Be brief.** Respect the developer's time. Short, clear responses.
5. **Match your approach to their level.** Asking a beginner "what do you think?" about something they've never seen is not Socratic — it's unhelpful. Teach first, then question.

## Language

Respond in the same language the developer writes in. If they write in Russian, respond in Russian. If they write in English, respond in English.
"""


@dataclass
class RuleViolation:
    rule: str
    severity: str   # "block" | "warn"
    detail: str


# Fenced code blocks — we allow short ones (single syntax examples for beginners)
# but block long ones (assembled programs / complete solutions)
_CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_SHORT_SNIPPET_MAX_LINES = 3  # a declaration, an import, a signature — fine

# Direct answer openers — soft warn
_DIRECT_ANSWER_RE = re.compile(
    r"^(the answer is|here(?:'s| is) (the|your) (solution|answer|code|fix)|"
    r"you (should|need to|can|must) (use|add|change|replace|write|put|set))\b",
    re.IGNORECASE | re.MULTILINE,
)


def _is_long_code_block(match: re.Match) -> bool:
    """A code block is 'long' if it has more than _SHORT_SNIPPET_MAX_LINES of actual code."""
    content = match.group(0)
    # Strip the ``` fences and language tag
    lines = content.split("\n")[1:-1]  # drop first ``` and last ```
    code_lines = [l for l in lines if l.strip()]
    return len(code_lines) > _SHORT_SNIPPET_MAX_LINES


def validate(text: str) -> list[RuleViolation]:
    violations: list[RuleViolation] = []

    long_blocks = [m for m in _CODE_BLOCK_RE.finditer(text) if _is_long_code_block(m)]
    if long_blocks:
        violations.append(RuleViolation(
            rule="no_code_blocks",
            severity="block",
            detail="Response contained a long code block (complete solution)",
        ))

    if _DIRECT_ANSWER_RE.search(text):
        violations.append(RuleViolation(
            rule="no_direct_answers",
            severity="warn",
            detail="Response may be giving a direct answer instead of guiding",
        ))

    # Soft check — questions are good but not mandatory when teaching beginners
    if "?" not in text and len(text) > 200:
        violations.append(RuleViolation(
            rule="no_questions",
            severity="warn",
            detail="Longer response with no questions — consider adding a check-in",
        ))

    if len(text) > 1600:
        violations.append(RuleViolation(
            rule="response_too_long",
            severity="warn",
            detail=f"Response is {len(text)} chars — mentor should be concise",
        ))

    return violations


def _redact_if_long(match: re.Match) -> str:
    if _is_long_code_block(match):
        return (
            "\n[I removed a big code block — I can show you individual pieces "
            "(a declaration, an import, a signature) but not the assembled program. "
            "Try putting the pieces together yourself!]\n"
        )
    return match.group(0)  # keep short snippets


def redact_code_blocks(text: str) -> str:
    return _CODE_BLOCK_RE.sub(_redact_if_long, text)


def apply_rules(text: str) -> tuple[str, list[RuleViolation]]:
    violations = validate(text)
    cleaned = text

    for v in violations:
        if v.rule == "no_code_blocks":
            cleaned = redact_code_blocks(cleaned)

    return cleaned, violations
