/**
 * Code Graph Analysis Tool
 *
 * Analyzes code dependencies and relationships
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface CodeGraphArgs {
  files: string[];
  includeExternalDeps?: boolean;
}

interface ImportInfo {
  source: string;
  imported: string[];
  type: 'esm' | 'commonjs' | 'python' | 'unknown';
}

interface FileAnalysis {
  path: string;
  imports: ImportInfo[];
  exports: string[];
  functions: string[];
  classes: string[];
}

/**
 * Parse JavaScript/TypeScript imports
 */
function parseJSImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ESM imports: import { x } from 'module'
  const esmRegex = /import\s+(?:{([^}]+)}|(\*\s+as\s+\w+)|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = esmRegex.exec(content)) !== null) {
    const imported = match[1]
      ? match[1].split(',').map(s => s.trim())
      : match[2]
      ? [match[2]]
      : ['default'];

    imports.push({
      source: match[3],
      imported,
      type: 'esm'
    });
  }

  // CommonJS require: const x = require('module')
  const cjsRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push({
      source: match[1],
      imported: ['*'],
      type: 'commonjs'
    });
  }

  return imports;
}

/**
 * Parse Python imports
 */
function parsePythonImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // from module import x, y
  const fromRegex = /from\s+([\w.]+)\s+import\s+([^;\n]+)/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const imported = match[2].split(',').map(s => s.trim());
    imports.push({
      source: match[1],
      imported,
      type: 'python'
    });
  }

  // import module
  const importRegex = /^import\s+([\w.]+)/gm;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push({
      source: match[1],
      imported: ['*'],
      type: 'python'
    });
  }

  return imports;
}

/**
 * Extract exports from JavaScript/TypeScript
 */
function parseJSExports(content: string): string[] {
  const exports: string[] = [];

  // export function/class/const
  const namedExportRegex = /export\s+(?:function|class|const|let|var)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // export { x, y }
  const exportListRegex = /export\s+{([^}]+)}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const items = match[1].split(',').map(s => s.trim());
    exports.push(...items);
  }

  // export default
  if (/export\s+default/.test(content)) {
    exports.push('default');
  }

  return exports;
}

/**
 * Extract function names
 */
function parseFunctions(content: string, ext: string): string[] {
  const functions: string[] = [];

  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    // function name()
    const funcRegex = /function\s+(\w+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }

    // const name = () => or const name = function()
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)/g;
    while ((match = arrowRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }
  } else if (ext === '.py') {
    // def function_name
    const pyFuncRegex = /def\s+(\w+)\s*\(/g;
    let match;
    while ((match = pyFuncRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }
  }

  return functions;
}

/**
 * Extract class names
 */
function parseClasses(content: string, ext: string): string[] {
  const classes: string[] = [];

  const classRegex = /class\s+(\w+)/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Analyze a single file
 */
async function analyzeFile(filePath: string): Promise<FileAnalysis> {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath);

  let imports: ImportInfo[] = [];
  let exports: string[] = [];

  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    imports = parseJSImports(content);
    exports = parseJSExports(content);
  } else if (ext === '.py') {
    imports = parsePythonImports(content);
  }

  const functions = parseFunctions(content, ext);
  const classes = parseClasses(content, ext);

  return {
    path: filePath,
    imports,
    exports,
    functions,
    classes
  };
}

/**
 * Build dependency graph
 */
function buildDependencyGraph(
  analyses: FileAnalysis[],
  includeExternal: boolean
): {
  nodes: { id: string; label: string; type: string }[];
  edges: { from: string; to: string; type: string }[];
} {
  const nodes = new Map<string, { id: string; label: string; type: string }>();
  const edges: { from: string; to: string; type: string }[] = [];

  // Create nodes for all files
  for (const analysis of analyses) {
    const fileName = path.basename(analysis.path);
    nodes.set(analysis.path, {
      id: analysis.path,
      label: fileName,
      type: 'file'
    });
  }

  // Create edges based on imports
  for (const analysis of analyses) {
    for (const imp of analysis.imports) {
      // Check if it's a relative import
      const isRelative = imp.source.startsWith('.') || imp.source.startsWith('/');

      if (isRelative) {
        // Try to resolve the import to a file in our analysis
        const resolved = analyses.find(a =>
          a.path.includes(imp.source.replace(/^\.\//, '').replace(/\.js$/, ''))
        );

        if (resolved) {
          edges.push({
            from: analysis.path,
            to: resolved.path,
            type: 'import'
          });
        }
      } else if (includeExternal) {
        // External dependency
        if (!nodes.has(imp.source)) {
          nodes.set(imp.source, {
            id: imp.source,
            label: imp.source,
            type: 'external'
          });
        }
        edges.push({
          from: analysis.path,
          to: imp.source,
          type: 'import'
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges
  };
}

/**
 * Analyze code graph
 */
export async function analyzeCodeGraph(args: CodeGraphArgs) {
  const { files, includeExternalDeps = false } = args;

  try {
    // Analyze all files
    const analyses = await Promise.all(
      files.map(file => analyzeFile(file))
    );

    // Build dependency graph
    const graph = buildDependencyGraph(analyses, includeExternalDeps);

    // Calculate metrics
    const metrics = {
      totalFiles: files.length,
      totalImports: analyses.reduce((sum, a) => sum + a.imports.length, 0),
      totalExports: analyses.reduce((sum, a) => sum + a.exports.length, 0),
      totalFunctions: analyses.reduce((sum, a) => sum + a.functions.length, 0),
      totalClasses: analyses.reduce((sum, a) => sum + a.classes.length, 0),
      externalDependencies: graph.nodes.filter(n => n.type === 'external').length
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              analyses,
              graph,
              metrics
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    throw new Error(
      `Failed to analyze code graph: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
