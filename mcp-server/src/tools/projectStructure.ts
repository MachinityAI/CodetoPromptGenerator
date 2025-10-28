/**
 * Project Structure Tool
 *
 * Retrieves the complete file and directory structure of a project
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import ignore from 'ignore';

interface ProjectStructureArgs {
  path: string;
  maxDepth?: number;
  includeHidden?: boolean;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  modified?: string;
}

/**
 * Load .gitignore patterns
 */
async function loadGitignore(projectPath: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();
  const gitignorePath = path.join(projectPath, '.gitignore');

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch (error) {
    // No .gitignore file, that's okay
  }

  // Always ignore common patterns
  ig.add([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '*.pyc',
    '__pycache__',
    '.DS_Store',
    '*.log'
  ]);

  return ig;
}

/**
 * Recursively build file tree
 */
async function buildFileTree(
  dirPath: string,
  relativePath: string,
  ig: ReturnType<typeof ignore>,
  currentDepth: number,
  maxDepth: number,
  includeHidden: boolean
): Promise<FileNode[]> {
  if (maxDepth !== -1 && currentDepth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const name = entry.name;

    // Skip hidden files unless explicitly included
    if (!includeHidden && name.startsWith('.')) {
      continue;
    }

    const entryRelativePath = relativePath ? `${relativePath}/${name}` : name;

    // Check gitignore
    if (ig.ignores(entryRelativePath)) {
      continue;
    }

    const entryFullPath = path.join(dirPath, name);
    const stats = await fs.stat(entryFullPath);

    if (entry.isDirectory()) {
      const children = await buildFileTree(
        entryFullPath,
        entryRelativePath,
        ig,
        currentDepth + 1,
        maxDepth,
        includeHidden
      );

      nodes.push({
        name,
        path: entryRelativePath,
        type: 'directory',
        children,
        modified: stats.mtime.toISOString()
      });
    } else if (entry.isFile()) {
      nodes.push({
        name,
        path: entryRelativePath,
        type: 'file',
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    }
  }

  // Sort: directories first, then alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * Get project structure
 */
export async function getProjectStructure(args: ProjectStructureArgs) {
  const { path: projectPath, maxDepth = -1, includeHidden = false } = args;

  try {
    // Verify path exists
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    // Load gitignore patterns
    const ig = await loadGitignore(projectPath);

    // Build file tree
    const tree = await buildFileTree(
      projectPath,
      '',
      ig,
      0,
      maxDepth,
      includeHidden
    );

    // Count files and directories
    const countNodes = (nodes: FileNode[]): { files: number; directories: number } => {
      let files = 0;
      let directories = 0;

      for (const node of nodes) {
        if (node.type === 'file') {
          files++;
        } else {
          directories++;
          if (node.children) {
            const childCounts = countNodes(node.children);
            files += childCounts.files;
            directories += childCounts.directories;
          }
        }
      }

      return { files, directories };
    };

    const counts = countNodes(tree);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectPath,
              tree,
              summary: {
                totalFiles: counts.files,
                totalDirectories: counts.directories,
                maxDepth: maxDepth === -1 ? 'unlimited' : maxDepth
              }
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    throw new Error(
      `Failed to get project structure: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
