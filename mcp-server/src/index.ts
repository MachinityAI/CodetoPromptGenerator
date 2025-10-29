#!/usr/bin/env node

/**
 * Code to Prompt MCP Server
 *
 * Provides intelligent code context management for agentic AI systems.
 * Designed to work with Claude Desktop and other MCP-compatible clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

import {
  getProjectStructure,
  smartFileSelection,
  analyzeCodeGraph,
  searchCodebase,
  getGitContext
} from './tools/index.js';

import {
  getProjectResource,
  getFileResource,
  getContextResource
} from './resources/index.js';

// Create MCP server instance
const server = new Server(
  {
    name: 'codetoprompt-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Tool Definitions
 *
 * These are the functions that AI agents can call to interact with codebases
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_project_structure',
        description: 'Get the complete file and directory structure of a project. Returns a tree view with files and folders, respecting .gitignore patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              minLength: 1,
              description: 'Absolute path to the project directory'
            },
            maxDepth: {
              type: 'integer',
              minimum: -1,
              description: 'Maximum depth to traverse (default: unlimited)',
              default: -1
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files and directories (default: false)',
              default: false
            }
          },
          required: ['path']
        }
      },
      {
        name: 'smart_file_selection',
        description: 'Use AI to intelligently select relevant files based on a task description. Returns a list of file paths that are most relevant to the given task.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              minLength: 1,
              description: 'Absolute path to the project directory'
            },
            taskDescription: {
              type: 'string',
              description: 'Description of the task or feature you want to work on'
            },
            maxFiles: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of files to select (default: 20)',
              default: 20
            }
          },
          required: ['projectPath', 'taskDescription']
        }
      },
      {
        name: 'analyze_code_graph',
        description: 'Analyze code dependencies and relationships between files. Returns import/export graph, function calls, class hierarchies, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of file paths to analyze'
            },
            includeExternalDeps: {
              type: 'boolean',
              description: 'Include external package dependencies (default: false)',
              default: false
            }
          },
          required: ['files']
        }
      },
      {
        name: 'search_codebase',
        description: 'Search for code patterns, functions, classes, or text across the codebase. Supports regex and semantic search.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              minLength: 1,
              description: 'Absolute path to the project directory'
            },
            query: {
              type: 'string',
              description: 'Search query (can be text, regex, or natural language)'
            },
            searchType: {
              type: 'string',
              enum: ['text', 'regex', 'semantic'],
              description: 'Type of search to perform (default: text)',
              default: 'text'
            },
            filePattern: {
              type: 'string',
              description: 'Glob pattern to filter files (e.g., "*.ts", "src/**/*.js")'
            }
          },
          required: ['projectPath', 'query']
        }
      },
      {
        name: 'get_git_context',
        description: 'Get git-related context: recent commits, changed files, current branch, and diff information.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              minLength: 1,
              description: 'Absolute path to the project directory'
            },
            includeDiff: {
              type: 'boolean',
              description: 'Include git diff information (default: true)',
              default: true
            },
            commitCount: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Number of recent commits to include (default: 10)',
              default: 10
            }
          },
          required: ['projectPath']
        }
      }
    ]
  };
});

/**
 * Tool Execution Handler
 *
 * Handles actual tool execution when AI agents call them
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'get_project_structure':
        return await getProjectStructure(args as Parameters<typeof getProjectStructure>[0]);

      case 'smart_file_selection':
        return await smartFileSelection(args as Parameters<typeof smartFileSelection>[0]);

      case 'analyze_code_graph':
        return await analyzeCodeGraph(args as Parameters<typeof analyzeCodeGraph>[0]);

      case 'search_codebase':
        return await searchCodebase(args as Parameters<typeof searchCodebase>[0]);

      case 'get_git_context':
        return await getGitContext(args as Parameters<typeof getGitContext>[0]);

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Resource Definitions
 *
 * Resources are readable data sources that AI agents can access
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'project://structure',
        name: 'Project Structure',
        description: 'Complete file and directory structure of the project',
        mimeType: 'application/json'
      },
      {
        uri: 'project://file/{path}',
        name: 'File Content',
        description: 'Content of a specific file in the project',
        mimeType: 'text/plain'
      },
      {
        uri: 'project://context/{hash}',
        name: 'Optimized Context',
        description: 'Pre-computed context optimized for specific tasks',
        mimeType: 'application/json'
      }
    ]
  };
});

/**
 * Resource Reading Handler
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri.startsWith('project://structure')) {
    return await getProjectResource(uri);
  } else if (uri.startsWith('project://file/')) {
    return await getFileResource(uri);
  } else if (uri.startsWith('project://context/')) {
    return await getContextResource(uri);
  } else {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unknown resource URI: ${uri}`
    );
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Code to Prompt MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
