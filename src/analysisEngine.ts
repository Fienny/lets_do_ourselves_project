import { ScannedFile, ProjectSnapshot, renderFolderTree } from './fileScanner';

/**
 * Builds context to prepend to the user's chat message
 * when a file or selection is attached.
 *
 * This is NOT a full analysis prompt — it sets up context so the mentor
 * can ask Socratic questions about it in response to what the user asks.
 */
export function buildFileContext(file: ScannedFile): string {
  const trimmed = trimContent(file.content, 6000);
  return `[Context: the developer has shared a file for discussion]
File: ${file.relativePath} (${file.language})

${trimmed}

[End of file context]`;
}

export function buildSelectionContext(code: string, language: string, filePath: string): string {
  return `[Context: the developer has selected a specific piece of code to discuss]
File: ${filePath} | Language: ${language}

${code}

[End of selection context]`;
}

/**
 * Builds the project structure context — shared at the start of a project-level
 * conversation so the mentor knows the lay of the land.
 */
export function buildProjectContext(snapshot: ProjectSnapshot): string {
  const tree = renderFolderTree(snapshot.folderTree);
  const langSummary = Object.entries(snapshot.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count} file(s)`)
    .join(', ');

  // Include contents of key source files up to token budget
  const MAX_CHARS = 12_000;
  let used = 0;
  const fileSnippets: string[] = [];

  const prioritized = [...snapshot.files].sort((a, b) => {
    const rank = (f: ScannedFile) => {
      const src = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#',
                   'Vue', 'Svelte', 'TypeScript (React)', 'JavaScript (React)'];
      return src.includes(f.language) ? 0 : 1;
    };
    return rank(a) - rank(b);
  });

  for (const file of prioritized) {
    if (used >= MAX_CHARS) break;
    const snippet = trimContent(file.content, Math.min(2000, MAX_CHARS - used));
    fileSnippets.push(`--- ${file.relativePath} ---\n${snippet}`);
    used += snippet.length;
  }

  return `[Context: the developer has shared their project for discussion]
Languages: ${langSummary}
Total files: ${snapshot.totalFiles}

Folder structure:
${tree}

Key file contents:
${fileSnippets.join('\n\n')}

[End of project context]`;
}

/**
 * Wraps user's message with any attached context.
 */
export function buildUserMessage(userText: string, context: string | null): string {
  if (!context) return userText;
  return `${context}\n\nMy question: ${userText}`;
}

function trimContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const half = Math.floor(maxChars / 2);
  return (
    content.slice(0, half) +
    `\n... [${content.length - maxChars} chars omitted] ...\n` +
    content.slice(-half)
  );
}
