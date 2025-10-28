/**
 * Resource handlers
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getProjectStructure } from '../tools/projectStructure.js';
import { smartFileSelection } from '../tools/smartSelection.js';
import { getGitContext } from '../tools/gitContext.js';

/**
 * Get project structure resource
 */
export async function getProjectResource(uri: string) {
  // Extract project path from URI query parameters
  const url = new URL(uri);
  const projectPath = url.searchParams.get('path');

  if (!projectPath) {
    throw new Error('Project path is required');
  }

  const result = await getProjectStructure({ path: projectPath });

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: result.content[0].text
      }
    ]
  };
}

/**
 * Get file content resource
 */
export async function getFileResource(uri: string) {
  // Extract file path from URI
  const filePath = uri.replace('project://file/', '');

  if (!filePath) {
    throw new Error('File path is required');
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: content,
          metadata: {
            size: stats.size,
            modified: stats.mtime.toISOString(),
            extension: path.extname(filePath)
          }
        }
      ]
    };
  } catch (error) {
    throw new Error(
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Simple in-memory cache for contexts
const contextCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a unique hash for context parameters
 */
function generateContextHash(params: any): string {
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(params));
  return hash.digest('hex');
}

/**
 * Get or create cached context
 */
async function getOrCreateContext(
  projectPath: string,
  taskDescription?: string
): Promise<any> {
  const params = { projectPath, taskDescription };
  const hash = generateContextHash(params);

  // Check cache
  const cached = contextCache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, cached: true, hash };
  }

  // Generate new context
  const context: any = {
    generated: new Date().toISOString(),
    projectPath,
    hash
  };

  // Get project structure
  try {
    const structure = await getProjectStructure({ path: projectPath, maxDepth: 3 });
    context.structure = JSON.parse(structure.content[0].text);
  } catch (error) {
    context.structureError = String(error);
  }

  // Get git context if available
  try {
    const git = await getGitContext({ projectPath, includeDiff: false, commitCount: 5 });
    context.git = JSON.parse(git.content[0].text);
  } catch (error) {
    // Git not available or not a repo
    context.git = null;
  }

  // If task description provided, get smart file selection
  if (taskDescription) {
    try {
      const files = await smartFileSelection({
        projectPath,
        taskDescription,
        maxFiles: 15
      });
      context.relevantFiles = JSON.parse(files.content[0].text);
    } catch (error) {
      context.filesError = String(error);
    }
  }

  // Cache the result
  contextCache.set(hash, { timestamp: Date.now(), data: context });

  // Clean up old cache entries (keep last 50)
  if (contextCache.size > 50) {
    const entries = Array.from(contextCache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    contextCache.clear();
    entries.slice(0, 50).forEach(([key, value]) => {
      contextCache.set(key, value);
    });
  }

  return context;
}

/**
 * Get pre-computed context resource
 */
export async function getContextResource(uri: string) {
  try {
    // Parse URI: project://context/{hash}?path=/path&task=description
    const url = new URL(uri);
    const projectPath = url.searchParams.get('path');
    const taskDescription = url.searchParams.get('task');

    if (!projectPath) {
      throw new Error('Project path is required (use ?path=/your/project)');
    }

    const context = await getOrCreateContext(projectPath, taskDescription || undefined);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(context, null, 2)
        }
      ]
    };
  } catch (error) {
    throw new Error(
      `Failed to get context: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
