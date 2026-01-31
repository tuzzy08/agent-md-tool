/**
 * Indexer module - creates a compressed directory tree representation
 */

import fs from 'fs/promises';
import path from 'path';
import type { IndexedDirectory } from './types.js';

/**
 * Recursively scan a directory and collect all markdown files
 */
async function scanDirectory(dirPath: string, basePath: string = ''): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden directories and common non-doc directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        // Recursively scan subdirectories
        const subFiles = await scanDirectory(fullPath, relativePath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if it's a markdown file
        const ext = path.extname(entry.name).toLowerCase();
        if (['.md', '.mdx', '.markdown'].includes(ext)) {
          files.push(relativePath);
        }
      }
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Documentation directory not found: ${dirPath}\n\n` +
        `Please run the download command first to fetch documentation.`
      );
    }
    if (error.code === 'EACCES') {
      throw new Error(
        `Permission denied reading directory: ${dirPath}\n\n` +
        `Please check file permissions.`
      );
    }
    throw new Error(`Failed to scan directory: ${error.message}`);
  }
  
  return files;
}

/**
 * Group files by their parent directory
 */
export function groupByDirectory(files: string[]): IndexedDirectory {
  const grouped: IndexedDirectory = {};
  
  for (const file of files) {
    const dir = path.dirname(file);
    const dirKey = dir === '.' ? '' : dir;
    
    if (!grouped[dirKey]) {
      grouped[dirKey] = [];
    }
    grouped[dirKey].push(path.basename(file));
  }
  
  return grouped;
}

/**
 * Generate the compressed index format
 * Format: directory:{file1.md,file2.md}
 */
export function generateCompressedIndex(grouped: IndexedDirectory, rootPath: string): string {
  const lines: string[] = [];
  const rootName = path.basename(rootPath);
  
  // Sort directories for consistent output
  const sortedDirs = Object.keys(grouped).sort((a, b) => {
    // Root files first, then alphabetically
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });
  
  for (const dir of sortedDirs) {
    const files = grouped[dir].sort();
    // Normalize path separators for cross-platform consistency
    const normalizedDir = dir.replace(/\\/g, '/');
    const dirDisplay = dir === '' ? rootName : `${rootName}/${normalizedDir}`;
    lines.push(`${dirDisplay}:{${files.join(',')}}`);
  }
  
  return lines.join('\n');
}

/**
 * Main indexing function - scans directory and generates compressed index
 */
export async function createIndex(docsPath: string): Promise<string> {
  // Verify directory exists
  try {
    const stats = await fs.stat(docsPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `Path is not a directory: ${docsPath}\n\n` +
        `Expected a directory containing markdown files.`
      );
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Documentation directory not found: ${docsPath}\n\n` +
        `Please download documentation first using:\n` +
        `  agent-md-tool <github-url>`
      );
    }
    throw error;
  }
  
  // Scan directory for all markdown files
  const files = await scanDirectory(docsPath);
  
  if (files.length === 0) {
    throw new Error(
      `No markdown files found in ${docsPath}\n\n` +
      `The directory exists but contains no .md, .mdx, or .markdown files.`
    );
  }
  
  // Group by directory
  const grouped = groupByDirectory(files);
  
  // Generate compressed format
  return generateCompressedIndex(grouped, docsPath);
}

/**
 * Get statistics about the indexed content
 */
export async function getIndexStats(docsPath: string): Promise<{ fileCount: number; dirCount: number }> {
  const files = await scanDirectory(docsPath);
  const grouped = groupByDirectory(files);
  
  return {
    fileCount: files.length,
    dirCount: Object.keys(grouped).length
  };
}
