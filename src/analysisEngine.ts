import { ProjectSnapshot, ScannedFile, renderFolderTree } from './fileScanner';

// ─── Prompt builders ──────────────────────────────────────────────────────────
// Each function builds a focused prompt for a specific analysis type.

/**
 * Full project scan: structure + patterns across all files.
 */
export function buildProjectAnalysisPrompt(snapshot: ProjectSnapshot): string {
  const languageSummary = Object.entries(snapshot.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `  - ${lang}: ${count} file(s)`)
    .join('\n');

  const filesSummary = snapshot.files
    .map((f) => `### ${f.relativePath} (${f.language})\n${f.content}`)
    .join('\n\n---\n\n');

  const tree = renderFolderTree(snapshot.folderTree);

  return `
You are reviewing a software project. Your task is to give a thorough best-practices analysis.

## Project Overview
- Root: ${snapshot.rootPath}
- Total files analyzed: ${snapshot.totalFiles} (${snapshot.skippedFiles} skipped as too large/binary)
- Languages detected:
${languageSummary}

## Folder Structure
\`\`\`
${tree}
\`\`\`

## File Contents

${filesSummary}

---

## Your Analysis Task

Please analyze this project across these dimensions, in this order:

1. **Folder & File Structure**
   - Is the folder structure logical and scalable?
   - Are files grouped by feature, by type, or something else? Is that the right choice?
   - What is missing or misplaced?

2. **Naming Conventions**
   - Are files, folders, variables, and functions named clearly and consistently?
   - What naming problems exist and why do they matter?

3. **Separation of Concerns**
   - Are responsibilities clearly divided between files/modules?
   - Are there files doing too many things?

4. **Code Quality Patterns**
   - Anti-patterns, duplication, unclear logic.
   - Missing error handling, security concerns.

5. **Tech Stack Best Practices**
   - Based on the detected technologies, what specific practices are missing?

6. **Top 3 Things To Fix First**
   - List the three most impactful improvements ranked by importance.
   - For each: explain the problem, explain why it matters, and describe (in plain words) what to do about it.

Remember: no code. Plain English explanations and step-by-step guidance only.
`.trim();
}

/**
 * Single file deep-dive analysis.
 */
export function buildFileAnalysisPrompt(file: ScannedFile): string {
  return `
You are reviewing a single file from a software project.

## File Details
- Path: ${file.relativePath}
- Language: ${file.language}
- Size: ${file.sizeKb.toFixed(1)} KB

## File Contents

${file.content}

---

## Your Analysis Task

Review this file and provide feedback on:

1. **What This File Does**
   - Summarize its purpose in 2-3 sentences.

2. **What's Working Well**
   - Identify 2-3 things the developer did right. Be specific.

3. **Issues Found**
   - Go through each problem you spot. For each issue:
     - Name the issue clearly.
     - Explain what it is and why it's a problem.
     - Describe what approach to take to fix it (no code, just the idea/concept).

4. **Structure & Organization**
   - Is this file's internal structure clear?
   - Should anything be extracted into its own module/function/file?

5. **One Key Lesson**
   - What is the single most important thing the developer should take away from this review?

Plain English only. No code blocks.
`.trim();
}

/**
 * Explain a selected code snippet without generating replacement code.
 */
export function buildSelectionExplainPrompt(
  code: string,
  language: string,
  filePath: string
): string {
  return `
A developer has selected a piece of code and wants to understand it and any issues with it.

## Context
- File: ${filePath}
- Language: ${language}

## Selected Code

${code}

---

## Your Task

1. **What This Code Does**
   - Explain what this code does, step by step, in simple language.
   - Assume the developer wants to genuinely understand it, not just copy a fix.

2. **Why It Might Not Work As Expected**
   - Are there bugs, edge cases, or logic errors?
   - Are there performance or security concerns?
   - Explain each issue and *why* it causes a problem.

3. **The Concept To Learn**
   - What underlying concept (pattern, language feature, algorithm, etc.) is at play here?
   - Explain it simply so the developer can apply it elsewhere.

4. **What To Do Next**
   - Describe the approach to fixing or improving this code — in plain steps.
   - What should the developer think about, look up, or restructure?

No code output. Explanations only.
`.trim();
}

/**
 * Trims file content to avoid hitting token limits.
 * For large files, keeps the beginning and end which usually contain the most structure.
 */
export function trimFileContent(content: string, maxChars = 3000): string {
  if (content.length <= maxChars) {
    return content;
  }

  const half = Math.floor(maxChars / 2);
  return (
    content.slice(0, half) +
    `\n\n... [${content.length - maxChars} characters omitted for brevity] ...\n\n` +
    content.slice(-half)
  );
}

/**
 * Prepares the project snapshot for sending to the AI.
 * Trims large files to avoid token overflows.
 */
export function prepareProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  const MAX_TOTAL_CHARS = 80_000; // ~20k tokens, safe for gpt-4o
  let totalChars = 0;

  const trimmedFiles = snapshot.files
    .sort((a, b) => {
      // Prioritize source files over config/lock files
      const priority = (f: ScannedFile) => {
        if (['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#'].includes(f.language)) return 0;
        if (['Vue', 'Svelte', 'TypeScript (React)', 'JavaScript (React)'].includes(f.language)) return 1;
        if (['HTML', 'CSS', 'SCSS'].includes(f.language)) return 2;
        return 3;
      };
      return priority(a) - priority(b);
    })
    .map((file) => {
      if (totalChars >= MAX_TOTAL_CHARS) {
        return { ...file, content: '[omitted — token limit reached]' };
      }
      const trimmed = trimFileContent(file.content);
      totalChars += trimmed.length;
      return { ...file, content: trimmed };
    });

  return { ...snapshot, files: trimmedFiles };
}
