/**
 * Smart File Selection Tool
 *
 * Uses AI to intelligently select relevant files based on task description
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ignoreFactory = require('ignore');

interface SmartSelectionArgs {
  projectPath: string;
  taskDescription: string;
  maxFiles?: number;
}

/**
 * Get all files in project respecting gitignore
 */
async function getAllFiles(projectPath: string): Promise<string[]> {
  const ig = ignoreFactory();

  // Load .gitignore
  try {
    const gitignorePath = path.join(projectPath, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {
    // No gitignore
  }

  // Default ignores
  ig.add([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '*.pyc',
    '__pycache__',
    '.DS_Store'
  ]);

  // Get all files
  const pattern = '**/*';
  const files = await glob(pattern, {
    cwd: projectPath,
    nodir: true,
    dot: false,
    absolute: false,
    ignore: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/__pycache__/**'
    ]
  });

  // Filter with gitignore
  return files.filter(file => !ig.ignores(file));
}

/**
 * Score files based on relevance to task
 */
function scoreFileRelevance(
  filePath: string,
  taskDescription: string
): number {
  let score = 0;
  const taskLower = taskDescription.toLowerCase();
  const fileLower = filePath.toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();

  // Extract keywords from task
  const keywords = taskLower
    .split(/\s+/)
    .filter(word => word.length > 3 && !['with', 'from', 'that', 'this'].includes(word));

  // Score based on keyword matches
  for (const keyword of keywords) {
    if (fileName.includes(keyword)) {
      score += 10; // File name match is very relevant
    } else if (fileLower.includes(keyword)) {
      score += 5; // Path match is somewhat relevant
    }
  }

  // Boost certain file types based on task
  if (taskLower.includes('test') && (fileLower.includes('test') || fileLower.includes('spec'))) {
    score += 15;
  }

  if (taskLower.includes('api') && (fileLower.includes('api') || fileLower.includes('controller'))) {
    score += 15;
  }

  if (taskLower.includes('ui') || taskLower.includes('component')) {
    if (fileLower.includes('component') || fileLower.includes('view') || fileLower.endsWith('.tsx')) {
      score += 15;
    }
  }

  if (taskLower.includes('database') || taskLower.includes('db')) {
    if (fileLower.includes('model') || fileLower.includes('schema') || fileLower.includes('migration')) {
      score += 15;
    }
  }

  // Penalize certain files
  if (fileName === 'package-lock.json' || fileName === 'yarn.lock') {
    score -= 100;
  }

  if (fileLower.includes('node_modules') || fileLower.includes('.min.')) {
    score -= 100;
  }

  // Prefer source files
  const ext = path.extname(filePath).toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'].includes(ext)) {
    score += 5;
  }

  // Prefer files in common source directories
  const normalizedPath = fileLower.replace(/\\/g, '/');
  if (normalizedPath.includes('/src/') || normalizedPath.startsWith('src/')) {
    score += 3;
  }

  return score;
}

/**
 * Smart file selection
 */
export async function smartFileSelection(args: SmartSelectionArgs) {
  const { projectPath, taskDescription, maxFiles = 20 } = args;

  try {
    if (!projectPath) {
      throw new Error('projectPath is required');
    }

    if (!path.isAbsolute(projectPath)) {
      throw new Error('projectPath must be an absolute path');
    }

    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      throw new Error('projectPath must be a directory');
    }

    if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
      throw new Error('maxFiles must be a positive integer');
    }

    const trimmedTask = taskDescription?.trim();
    if (!trimmedTask) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                taskDescription: trimmedTask,
                selectedFiles: [],
                summary: { totalScanned: 0, selectedCount: 0, totalSize: 0 }
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Get all files
    const allFiles = await getAllFiles(projectPath);

    // Score files
    const scoredFiles = allFiles
      .map(file => ({
        path: file,
        score: scoreFileRelevance(file, trimmedTask)
      }))
      .filter(item => item.score > 0) // Only include files with positive score
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles);

    // Get file info for selected files
    const selectedFiles = await Promise.all(
      scoredFiles.map(async (item) => {
        const fullPath = path.join(projectPath, item.path);
        const stats = await fs.stat(fullPath);

        return {
          path: item.path,
          score: item.score,
          size: stats.size,
          extension: path.extname(item.path)
        };
      })
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              taskDescription: trimmedTask,
              selectedFiles,
              summary: {
                totalScanned: allFiles.length,
                selectedCount: selectedFiles.length,
                totalSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
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
      `Failed to perform smart file selection: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
