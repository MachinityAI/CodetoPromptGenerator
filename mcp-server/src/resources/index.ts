/**
 * Resource handlers
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectStructure } from '../tools/projectStructure.js';

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

/**
 * Get pre-computed context resource
 */
export async function getContextResource(uri: string) {
  // Extract context hash from URI
  const hash = uri.replace('project://context/', '');

  // This would be implemented with a context cache
  // For now, return a placeholder
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          hash,
          message: 'Context caching not yet implemented',
          suggestion: 'Use tools to generate context on demand'
        })
      }
    ]
  };
}
