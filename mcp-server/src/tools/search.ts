/**
 * Codebase Search Tool
 *
 * Search for code patterns, text, or semantic matches
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ignoreFactory = require('ignore');

interface SearchArgs {
  projectPath: string;
  query: string;
  searchType?: 'text' | 'regex' | 'semantic';
  filePattern?: string;
}

interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context: string;
}

function isRegexSafe(pattern: string, maxLength = 200): boolean {
  if (pattern.length === 0 || pattern.length > maxLength) {
    return false;
  }

  const dangerous = [
    /(\(.*\+.*\))\+/, // (a+)+
    /(\(.*\*.*\))\*/, // (a*)*
    /(\(.*\+.*\))\*/, // (a+)*
    /(\(.*\*.*\))\+/ // (a*)+
  ];

  return !dangerous.some((regex) => regex.test(pattern));
}

/**
 * Get files matching pattern
 */
async function getMatchingFiles(
  projectPath: string,
  pattern?: string
): Promise<string[]> {
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
  ig.add(['node_modules', '.git', '.next', 'dist', 'build']);

  // Get files
  const globPattern = pattern || '**/*';
  const files = await glob(globPattern, {
    cwd: projectPath,
    nodir: true,
    dot: false,
    absolute: true
  });

  return files.filter(file => {
    const relative = path.relative(projectPath, file);
    return !ig.ignores(relative);
  });
}

/**
 * Search for text in file
 */
async function searchInFile(
  filePath: string,
  query: string,
  searchType: 'text' | 'regex'
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let regex: RegExp;
    if (searchType === 'regex') {
      if (!isRegexSafe(query)) {
        throw new Error('Potentially unsafe regex pattern detected');
      }
      try {
        regex = new RegExp(query, 'gi');
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        // Get context (2 lines before and after)
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(lines.length, i + 3);
        const contextLines = lines.slice(contextStart, contextEnd);

        results.push({
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          context: contextLines.join('\n')
        });
      }
    }
  } catch (error) {
    // Skip files that can't be read
  }

  return results;
}

/**
 * Search codebase
 */
export async function searchCodebase(args: SearchArgs) {
  const {
    projectPath,
    query,
    searchType = 'text',
    filePattern
  } = args;

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

    if (!query || !query.trim()) {
      throw new Error('query is required');
    }

    // Get files to search
    const files = await getMatchingFiles(projectPath, filePattern);

    // Perform search based on type
    let allResults: SearchResult[] = [];

    if (searchType === 'text' || searchType === 'regex') {
      // Search in each file
      const searchPromises = files.map(file =>
        searchInFile(file, query, searchType)
      );

      const fileResults = await Promise.all(searchPromises);
      allResults = fileResults.flat();
    } else if (searchType === 'semantic') {
      // Semantic search would require embeddings
      // TODO: Implement embeddings-backed semantic search
      const searchPromises = files.map(file =>
        searchInFile(file, query, 'text')
      );

      const fileResults = await Promise.all(searchPromises);
      allResults = fileResults.flat();
    }

    // Make file paths relative
    allResults = allResults.map(result => ({
      ...result,
      file: path.relative(projectPath, result.file)
    }));

    // Limit results
    const maxResults = 100;
    const limitedResults = allResults.slice(0, maxResults);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              searchType,
              results: limitedResults,
              summary: {
                totalMatches: allResults.length,
                filesSearched: files.length,
                filesWithMatches: new Set(limitedResults.map(r => r.file)).size,
                truncated: allResults.length > maxResults
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
      `Failed to search codebase: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
