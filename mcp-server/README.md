# Code to Prompt MCP Server

A Model Context Protocol (MCP) server that provides intelligent code context management for agentic AI systems like Claude Desktop, Cursor, and other MCP-compatible clients.

## Features

### 🛠️ Tools

The server provides the following tools that AI agents can use:

1. **`get_project_structure`** - Get complete file and directory structure
   - Respects `.gitignore` patterns
   - Configurable depth and hidden file inclusion
   - Returns tree view with metadata

2. **`smart_file_selection`** - AI-powered intelligent file selection
   - Analyzes task description
   - Scores files based on relevance
   - Returns ranked list of most relevant files
   - Perfect for selecting context for specific tasks

3. **`analyze_code_graph`** - Code dependency and relationship analysis
   - Extracts imports/exports
   - Identifies functions and classes
   - Builds dependency graph
   - Supports JavaScript, TypeScript, and Python

4. **`search_codebase`** - Search code with multiple strategies
   - Text search
   - Regex search
   - Semantic search (planned)
   - Returns matches with context

5. **`get_git_context`** - Git-aware context retrieval
   - Recent commits
   - Changed files
   - Current branch and status
   - Diffs of changes
   - Perfect for understanding recent development activity

### 📦 Resources

Resources are read-only data sources:

1. **`project://structure?path=/path/to/project`** - Project structure
2. **`project://file/{absolute_path}`** - Individual file contents
3. **`project://context/{hash}`** - Pre-computed context (planned)

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

### Claude Desktop

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "codetoprompt": {
      "command": "node",
      "args": [
        "/absolute/path/to/CodetoPromptGenerator/mcp-server/dist/index.js"
      ]
    }
  }
}
```

### Cursor IDE

Add to your Cursor MCP configuration:

```json
{
  "mcp": {
    "servers": {
      "codetoprompt": {
        "command": "node",
        "args": ["/absolute/path/to/mcp-server/dist/index.js"]
      }
    }
  }
}
```

## Usage Examples

### With Claude Desktop

Once configured, you can ask Claude:

```
"Use the get_project_structure tool to show me the structure of /path/to/my/project"

"Use smart_file_selection to find the most relevant files for implementing user authentication"

"Use search_codebase to find all usages of the `UserService` class"

"Use get_git_context to show me what changed in the last 10 commits"

"Use analyze_code_graph to show me the dependencies between these files"
```

### Example Conversation

**You**: "I need to fix a bug in the authentication flow"

**Claude**: "Let me help you with that. First, I'll use the smart file selection tool to find the relevant files."

*Claude uses `smart_file_selection` with task: "fix authentication bug"*

**Claude**: "I found these relevant files:
- src/auth/AuthService.ts
- src/auth/LoginComponent.tsx
- src/middleware/authMiddleware.ts

Let me analyze the code graph to understand their relationships..."

*Claude uses `analyze_code_graph`*

**Claude**: "Now let me check the recent git history to see if there were recent changes..."

*Claude uses `get_git_context`*

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode for development
npm run watch

# Test with MCP Inspector
npm run inspector
```

## MCP Inspector

The MCP Inspector is a great tool for testing your server:

```bash
npx @modelcontextprotocol/inspector dist/index.js
```

This will open a web interface where you can test tools and resources.

## Architecture

```
mcp-server/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── tools/                # Tool implementations
│   │   ├── projectStructure.ts
│   │   ├── smartSelection.ts
│   │   ├── codeGraph.ts
│   │   ├── search.ts
│   │   ├── gitContext.ts
│   │   └── index.ts
│   └── resources/            # Resource implementations
│       └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Server Initialization**: The MCP server starts and registers tools and resources
2. **Communication**: Uses stdio transport to communicate with clients
3. **Tool Invocation**: When an AI asks to use a tool, the client sends a request
4. **Execution**: The server executes the tool and returns results
5. **Response**: Results are formatted and sent back to the AI

## Benefits for Agentic Coding

- **Context-Aware**: AI agents can intelligently select relevant files
- **Git-Aware**: Understands recent changes and development activity
- **Relationship Understanding**: Analyzes code dependencies and structure
- **Efficient**: Avoids sending entire codebases, only relevant context
- **Incremental**: Can request additional context as needed
- **Standard Protocol**: Works with any MCP-compatible client

## Future Enhancements

- [ ] Semantic code search with embeddings
- [ ] Context caching for faster repeated requests
- [ ] Incremental updates (only send changed files)
- [ ] More language support (Go, Rust, Java, etc.)
- [ ] AST-based refactoring suggestions
- [ ] Code quality metrics
- [ ] Test coverage integration
- [ ] Documentation generation

## Troubleshooting

### Server Not Starting

1. Check that Node.js is installed (`node --version`)
2. Verify the path in your MCP configuration is absolute
3. Check that the server is built (`npm run build`)
4. Look at Claude Desktop logs for errors

### Tools Not Working

1. Use MCP Inspector to test tools directly
2. Check that file paths are absolute
3. Verify git is installed for `get_git_context`
4. Check file permissions

## Contributing

Contributions are welcome! This server is part of the Code to Prompt Generator project.

## License

MIT

## Related

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/download)
- [MCP SDK Documentation](https://github.com/anthropics/modelcontextprotocol)
