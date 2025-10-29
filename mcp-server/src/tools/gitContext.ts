/**
 * Git Context Tool
 *
 * Provides git-related context: commits, diffs, changed files, etc.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface GitContextArgs {
  projectPath: string;
  includeDiff?: boolean;
  commitCount?: number;
}

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

/**
 * Execute git command
 */
async function gitCommand(
  cwd: string,
  args: string[],
  maxBuffer = 10 * 1024 * 1024
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Git command failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if directory is a git repository
 */
async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    await gitCommand(projectPath, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recent commits
 */
async function getRecentCommits(
  projectPath: string,
  count: number
): Promise<GitCommit[]> {
  const format = '%H%x1f%an%x1f%ai%x1f%s%x1e';
  const output = await gitCommand(
    projectPath,
    ['log', `-${count}`, `--pretty=format:${format}`]
  );

  const commits: GitCommit[] = [];
  const entries = output.split('\x1e').filter(Boolean);

  for (const entry of entries) {
    const [hash, author, date, message] = entry.split('\x1f');
    if (hash && author && date && message) {
      commits.push({
        hash,
        author,
        date,
        message: message.trim()
      });
    }
  }

  return commits;
}

/**
 * Get git status
 */
async function getGitStatus(projectPath: string): Promise<GitStatus> {
  // Get branch name
  const branch = await gitCommand(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

  // Get ahead/behind count
  let ahead = 0;
  let behind = 0;
  try {
    const counts = await gitCommand(
      projectPath,
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']
    );
    const parts = counts.split('\t');
    if (parts.length === 2) {
      ahead = parseInt(parts[0]);
      behind = parseInt(parts[1]);
    }
  } catch {
    // No upstream branch
  }

  // Get status
  const statusOutput = await gitCommand(projectPath, ['status', '--porcelain']);
  const statusLines = statusOutput.split('\n').filter(l => l.trim());

  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const untracked: string[] = [];

  for (const line of statusLines) {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status === '??') {
      untracked.push(file);
    } else if (status.includes('M')) {
      modified.push(file);
    } else if (status.includes('A')) {
      added.push(file);
    } else if (status.includes('D')) {
      deleted.push(file);
    }
  }

  return {
    branch,
    ahead,
    behind,
    modified,
    added,
    deleted,
    untracked
  };
}

/**
 * Get git diff
 */
async function getGitDiff(projectPath: string): Promise<string> {
  try {
    // Get diff of staged and unstaged changes
    const stagedDiff = await gitCommand(projectPath, ['diff', '--cached']);
    const unstagedDiff = await gitCommand(projectPath, ['diff']);

    return `# Staged Changes\n${stagedDiff}\n\n# Unstaged Changes\n${unstagedDiff}`;
  } catch {
    return '';
  }
}

/**
 * Get changed files in recent commits
 */
async function getChangedFiles(
  projectPath: string,
  commitCount: number
): Promise<{ file: string; changes: number }[]> {
  try {
    const output = await gitCommand(
      projectPath,
      ['diff', '--numstat', `HEAD~${commitCount}..HEAD`]
    );

    const lines = output.split('\n').filter(l => l.trim());
    const files: { file: string; changes: number }[] = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parseInt(parts[0]) || 0;
        const deleted = parseInt(parts[1]) || 0;
        files.push({
          file: parts[2],
          changes: added + deleted
        });
      }
    }

    return files.sort((a, b) => b.changes - a.changes);
  } catch {
    return [];
  }
}

/**
 * Get git context
 */
export async function getGitContext(args: GitContextArgs) {
  const {
    projectPath,
    includeDiff = true,
    commitCount = 10
  } = args;

  const MAX_COMMIT_COUNT = 100;
  const safeCommitCount = Number.isInteger(commitCount)
    ? Math.min(Math.max(commitCount, 1), MAX_COMMIT_COUNT)
    : 10;

  try {
    // Check if it's a git repository
    if (!(await isGitRepo(projectPath))) {
      throw new Error('Not a git repository');
    }

    // Get git information
    const commits = await getRecentCommits(projectPath, safeCommitCount);
    const status = await getGitStatus(projectPath);
    const changedFiles = await getChangedFiles(projectPath, safeCommitCount);
    const diff = includeDiff ? await getGitDiff(projectPath) : '';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              repository: {
                branch: status.branch,
                ahead: status.ahead,
                behind: status.behind
              },
              status: {
                modified: status.modified,
                added: status.added,
                deleted: status.deleted,
                untracked: status.untracked
              },
              recentCommits: commits,
              changedFiles: changedFiles.slice(0, 20), // Top 20 most changed files
              diff: includeDiff ? diff : undefined,
              summary: {
                totalCommits: commits.length,
                filesWithChanges: status.modified.length + status.added.length + status.deleted.length,
                untrackedFiles: status.untracked.length
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
      `Failed to get git context: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
