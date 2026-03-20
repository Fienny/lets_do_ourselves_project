import * as vscode from 'vscode';
import * as path from 'path';

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  language: string;
  sizeKb: number;
}

export interface ProjectSnapshot {
  rootPath: string;
  folderTree: FolderNode;
  files: ScannedFile[];
  totalFiles: number;
  skippedFiles: number;
  languages: Record<string, number>;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  files: string[];
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.py': 'Python',
  '.java': 'Java',
  '.cs': 'C#',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.md': 'Markdown',
  '.sh': 'Shell',
  '.env': 'Environment',
};

/**
 * Scans the entire workspace and returns a structured snapshot.
 * This is the core capability: reading every file VSCode can see.
 */
export async function scanProject(
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<ProjectSnapshot> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open. Please open a project folder first.');
  }

  const config = vscode.workspace.getConfiguration('ldo');
  const maxFileSizeKb: number = config.get('maxFileSizeKb', 100);
  const excludePatterns: string[] = config.get('excludePatterns', [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
    '**/*.lock',
    '**/package-lock.json',
  ]);

  const rootPath = workspaceFolders[0].uri.fsPath;
  const excludeGlob = `{${excludePatterns.join(',')}}`;

  progress?.report({ message: 'Finding project files...' });

  // VSCode workspace API — this is how we find ALL files in the project
  const fileUris = await vscode.workspace.findFiles('**/*', excludeGlob);

  const scannedFiles: ScannedFile[] = [];
  const languages: Record<string, number> = {};
  let skipped = 0;
  const total = fileUris.length;

  for (let i = 0; i < fileUris.length; i++) {
    const uri = fileUris[i];
    const relativePath = path.relative(rootPath, uri.fsPath);
    const ext = path.extname(uri.fsPath).toLowerCase();
    const language = LANGUAGE_MAP[ext] ?? 'Other';

    progress?.report({
      message: `Scanning (${i + 1}/${total}): ${relativePath}`,
      increment: (1 / total) * 100,
    });

    try {
      // Read file content — works for any text file in the workspace
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const sizeKb = contentBytes.byteLength / 1024;

      if (sizeKb > maxFileSizeKb) {
        skipped++;
        continue;
      }

      const content = Buffer.from(contentBytes).toString('utf-8');

      // Skip binary files (contains null bytes)
      if (content.includes('\0')) {
        skipped++;
        continue;
      }

      scannedFiles.push({
        relativePath,
        absolutePath: uri.fsPath,
        content,
        language,
        sizeKb,
      });

      languages[language] = (languages[language] ?? 0) + 1;
    } catch {
      skipped++;
    }
  }

  const folderTree = buildFolderTree(rootPath, scannedFiles);

  return {
    rootPath,
    folderTree,
    files: scannedFiles,
    totalFiles: scannedFiles.length,
    skippedFiles: skipped,
    languages,
  };
}

/**
 * Scans only the currently active file.
 */
export async function scanCurrentFile(): Promise<ScannedFile | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const uri = editor.document.uri;
  const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const relativePath = path.relative(rootPath, uri.fsPath);
  const ext = path.extname(uri.fsPath).toLowerCase();
  const content = editor.document.getText();

  return {
    relativePath,
    absolutePath: uri.fsPath,
    content,
    language: LANGUAGE_MAP[ext] ?? 'Other',
    sizeKb: Buffer.byteLength(content, 'utf-8') / 1024,
  };
}

/**
 * Returns the text currently selected in the active editor.
 */
export function getSelectedCode(): { code: string; language: string; filePath: string } | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    return null;
  }

  const code = editor.document.getText(selection);
  const ext = path.extname(editor.document.fileName).toLowerCase();

  return {
    code,
    language: LANGUAGE_MAP[ext] ?? editor.document.languageId,
    filePath: path.relative(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      editor.document.fileName
    ),
  };
}

function buildFolderTree(rootPath: string, files: ScannedFile[]): FolderNode {
  const root: FolderNode = {
    name: path.basename(rootPath),
    path: '',
    children: [],
    files: [],
  };

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let child = current.children.find((c) => c.name === folderName);
      if (!child) {
        child = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          children: [],
          files: [],
        };
        current.children.push(child);
      }
      current = child;
    }

    current.files.push(parts[parts.length - 1]);
  }

  return root;
}

/**
 * Renders the folder tree as a readable string for the AI prompt.
 */
export function renderFolderTree(node: FolderNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  let result = `${pad}${node.name}/\n`;

  for (const child of node.children) {
    result += renderFolderTree(child, indent + 1);
  }

  for (const file of node.files) {
    result += `${pad}  ${file}\n`;
  }

  return result;
}
