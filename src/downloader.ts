/**
 * Downloader module - fetches documentation from GitHub repositories
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import type { GitHubTreeResponse, GitHubTreeItem, ParsedGitHubUrl, DownloadResult, CliOptions } from './types.js';

// Common branch names to try as fallback
const BRANCH_FALLBACKS = ['main', 'master', 'develop', 'dev'];

/**
 * Parse a GitHub URL to extract owner, repo, and optionally branch
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  // Handle various GitHub URL formats
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch
  // https://github.com/owner/repo/tree/branch/path
  // github.com/owner/repo (without https)
  
  // Normalize URL
  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  cleanUrl = cleanUrl.replace(/\.git$/, '').replace(/\/$/, '');
  
  const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?/);
  
  if (!match) {
    throw new Error(
      `Invalid GitHub URL: "${url}"\n\n` +
      `Expected formats:\n` +
      `  • https://github.com/owner/repo\n` +
      `  • https://github.com/owner/repo/tree/branch\n` +
      `  • github.com/owner/repo`
    );
  }

  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] || '' // Empty means we'll auto-detect
  };
}

/**
 * Generate a clean source name from the repo
 */
export function generateSourceName(owner: string, repo: string): string {
  return `${repo}-docs`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Try to fetch the repository tree, attempting multiple branch names if needed
 */
async function fetchRepoTreeWithFallback(
  owner: string, 
  repo: string, 
  preferredBranch: string
): Promise<{ tree: GitHubTreeItem[]; branch: string }> {
  // Build list of branches to try
  const branchesToTry: string[] = [];
  
  if (preferredBranch) {
    branchesToTry.push(preferredBranch);
  }
  
  // Add fallbacks if not already in list
  for (const fallback of BRANCH_FALLBACKS) {
    if (!branchesToTry.includes(fallback)) {
      branchesToTry.push(fallback);
    }
  }
  
  let lastError: Error | null = null;
  
  for (const branch of branchesToTry) {
    try {
      const tree = await fetchRepoTree(owner, repo, branch);
      return { tree, branch };
    } catch (error: any) {
      lastError = error;
      // Only continue trying if it's a 404 (branch not found)
      if (error.message?.includes('not found') || error.response?.status === 404) {
        continue;
      }
      // For other errors (rate limit, network), throw immediately
      throw error;
    }
  }
  
  throw new Error(
    `Could not find repository: ${owner}/${repo}\n\n` +
    `Tried branches: ${branchesToTry.join(', ')}\n\n` +
    `Please check:\n` +
    `  • The repository exists and is public\n` +
    `  • The URL is correct\n` +
    `  • Use --branch to specify the correct branch name`
  );
}

/**
 * Fetch the repository tree from GitHub API
 */
async function fetchRepoTree(owner: string, repo: string, branch: string): Promise<GitHubTreeItem[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  
  try {
    const response = await axios.get<GitHubTreeResponse>(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'agent-md-tool'
      },
      timeout: 30000 // 30 second timeout
    });

    if (response.data.truncated) {
      console.warn(
        '\n⚠️  Warning: Repository has many files. Some files may be missing.\n' +
        '   Consider using --path to target a specific directory.\n'
      );
    }

    return response.data.tree;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new Error(
        `Connection timeout while fetching ${owner}/${repo}\n\n` +
        `Please check your internet connection and try again.`
      );
    }
    if (error.response?.status === 404) {
      throw new Error(`Repository or branch not found: ${owner}/${repo} (branch: ${branch})`);
    }
    if (error.response?.status === 403) {
      const resetTime = error.response.headers?.['x-ratelimit-reset'];
      const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString() : 'soon';
      throw new Error(
        `GitHub API rate limit exceeded.\n\n` +
        `The rate limit will reset at ${resetDate}.\n` +
        `To avoid rate limits, you can:\n` +
        `  • Wait a few minutes and try again\n` +
        `  • Authenticate with a GitHub token (set GITHUB_TOKEN env var)`
      );
    }
    if (error.response?.status === 401) {
      throw new Error(
        `GitHub authentication failed.\n\n` +
        `If using GITHUB_TOKEN, please check that it's valid.`
      );
    }
    throw new Error(`Failed to fetch repository: ${error.message}`);
  }
}

/**
 * Common documentation folder names to look for
 */
const DOC_FOLDER_NAMES = ['docs', 'doc', 'documentation', 'guide', 'guides'];

/**
 * Try to find a documentation folder in the repo tree
 */
function findDocsFolder(tree: GitHubTreeItem[]): string | null {
  // Get all directories at root level
  const rootDirs = tree
    .filter(item => item.type === 'tree' && !item.path.includes('/'))
    .map(item => item.path.toLowerCase());
  
  // Check for common doc folder names
  for (const docName of DOC_FOLDER_NAMES) {
    if (rootDirs.includes(docName)) {
      // Return the actual path (preserving case)
      const actualDir = tree.find(
        item => item.type === 'tree' && item.path.toLowerCase() === docName
      );
      if (actualDir) {
        return actualDir.path;
      }
    }
  }
  
  return null;
}

/**
 * Filter tree items to only include markdown files in the specified path
 */
function filterMarkdownFiles(tree: GitHubTreeItem[], targetPath: string): GitHubTreeItem[] {
  const normalizedPath = targetPath.replace(/^\/|\/$/g, '');
  
  return tree.filter(item => {
    // Only files (blobs)
    if (item.type !== 'blob') return false;
    
    // Check if file is in target path
    const itemPath = item.path;
    if (normalizedPath && !itemPath.startsWith(normalizedPath + '/') && itemPath !== normalizedPath) {
      return false;
    }
    
    // Only markdown/MDX files
    const ext = path.extname(item.path).toLowerCase();
    return ['.md', '.mdx', '.markdown'].includes(ext);
  });
}

/**
 * Download a single file from GitHub
 */
async function downloadFile(owner: string, repo: string, branch: string, filePath: string): Promise<string> {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  
  try {
    const response = await axios.get(rawUrl, {
      headers: {
        'User-Agent': 'agent-md-tool'
      },
      responseType: 'text',
      timeout: 15000 // 15 second timeout per file
    });
    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Timeout downloading ${filePath}. Please try again.`);
    }
    if (error.response?.status === 404) {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Failed to download ${filePath}: ${error.message}`);
  }
}

/**
 * Ensure path is safe (no directory traversal)
 */
function sanitizePath(basePath: string, relativePath: string): string {
  const fullPath = path.resolve(basePath, relativePath);
  if (!fullPath.startsWith(path.resolve(basePath))) {
    throw new Error(`Invalid path detected: ${relativePath}`);
  }
  return fullPath;
}

/**
 * Main download function - orchestrates the entire download process
 */
export async function downloadDocs(
  source: string,
  options: CliOptions,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<DownloadResult & { detectedPath?: string }> {
  // Parse GitHub URL
  const { owner, repo, branch: urlBranch } = parseGitHubUrl(source);
  
  // Determine which branch to use
  const preferredBranch = options.branch !== 'main' ? options.branch : (urlBranch || options.branch);
  
  // Generate source name
  const sourceName = options.sourceName || generateSourceName(owner, repo);
  
  // Create docs directory
  const docsPath = path.join(process.cwd(), options.docsDir, sourceName);
  
  try {
    await fs.mkdir(docsPath, { recursive: true });
  } catch (error: any) {
    throw new Error(
      `Failed to create docs directory: ${docsPath}\n\n` +
      `Error: ${error.message}\n\n` +
      `Please check you have write permissions to this location.`
    );
  }
  
  // Fetch repository tree with branch fallback
  const { tree, branch: actualBranch } = await fetchRepoTreeWithFallback(owner, repo, preferredBranch);
  
  // Auto-detect docs folder if user didn't specify a path
  let targetPath = options.path;
  let detectedPath: string | undefined;
  
  if (targetPath === '/' || targetPath === '') {
    const autoDetectedPath = findDocsFolder(tree);
    if (autoDetectedPath) {
      targetPath = autoDetectedPath;
      detectedPath = autoDetectedPath;
    }
  }
  
  // Filter to markdown files in target path
  const markdownFiles = filterMarkdownFiles(tree, targetPath);
  
  if (markdownFiles.length === 0) {
    const pathInfo = targetPath !== '/' && targetPath !== '' ? ` in path "${targetPath}"` : '';
    throw new Error(
      `No markdown files found in ${owner}/${repo}${pathInfo}\n\n` +
      `The tool looks for files with extensions: .md, .mdx, .markdown\n\n` +
      `Suggestions:\n` +
      `  • Check that the repository contains markdown documentation\n` +
      `  • Try a different --path (e.g., --path docs, --path documentation)\n` +
      `  • Verify the path exists in the repository`
    );
  }
  
  // Update options.path for the rest of the function
  const effectivePath = targetPath.replace(/^\/|\/$/g, '');

  // Download files
  let downloadedCount = 0;
  const failedFiles: string[] = [];
  
  for (const file of markdownFiles) {
    // Calculate relative path from target directory
    let relativePath = file.path;
    if (effectivePath) {
      relativePath = file.path.substring(effectivePath.length + 1);
    }
    
    // Sanitize and create local path
    const localPath = sanitizePath(docsPath, relativePath);
    const localDir = path.dirname(localPath);
    
    try {
      // Create directory structure
      await fs.mkdir(localDir, { recursive: true });
      
      // Download and save file
      const content = await downloadFile(owner, repo, actualBranch, file.path);
      await fs.writeFile(localPath, content, 'utf-8');
      
      downloadedCount++;
      onProgress?.(downloadedCount, markdownFiles.length, relativePath);
    } catch (error: any) {
      failedFiles.push(relativePath);
      // Continue downloading other files
    }
  }
  
  if (downloadedCount === 0) {
    throw new Error(
      `Failed to download any files from ${owner}/${repo}\n\n` +
      `Please check your internet connection and try again.`
    );
  }
  
  if (failedFiles.length > 0) {
    console.warn(
      `\n⚠️  Warning: ${failedFiles.length} file(s) failed to download:\n` +
      failedFiles.slice(0, 5).map(f => `   • ${f}`).join('\n') +
      (failedFiles.length > 5 ? `\n   ... and ${failedFiles.length - 5} more` : '')
    );
  }
  
  return {
    totalFiles: markdownFiles.length,
    downloadedFiles: downloadedCount,
    docsPath,
    sourceName,
    detectedPath
  };
}
