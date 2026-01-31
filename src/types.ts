/**
 * Type definitions for agent-md-tool
 */

export interface CliOptions {
  output: string;
  docsDir: string;
  path: string;
  sourceName?: string;
  branch: string;
}

export interface GitHubFile {
  path: string;
  type: 'file' | 'dir';
  sha: string;
  size: number;
  url: string;
  download_url: string | null;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
}

export interface IndexedDirectory {
  [directory: string]: string[];
}

export interface DownloadResult {
  totalFiles: number;
  downloadedFiles: number;
  docsPath: string;
  sourceName: string;
}
