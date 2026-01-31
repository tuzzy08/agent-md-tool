/**
 * LLMs.txt module - fetches and saves llms.txt files
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import type { DownloadResult, CliOptions } from './types.js';

/**
 * Check if a URL is an llms.txt URL
 */
export function isLlmsTxtUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('/llms.txt') || 
         lowerUrl.endsWith('/llm.txt') ||
         lowerUrl.endsWith('llms.txt') ||
         lowerUrl.endsWith('llm.txt');
}

/**
 * Generate a source name from an llms.txt URL
 */
export function generateLlmsSourceName(url: string): string {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.replace(/^www\./, '').split('.')[0];
    return `${host}-llms`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
  } catch {
    return 'llms-txt';
  }
}

/**
 * Download an llms.txt file from a URL
 */
export async function downloadLlmsTxt(
  url: string,
  options: CliOptions,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<DownloadResult> {
  // Validate URL
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error(
      `Invalid URL: "${url}"\n\n` +
      `Please provide a valid llms.txt URL, e.g.:\n` +
      `  https://example.com/llms.txt`
    );
  }

  // Generate source name
  const sourceName = options.sourceName || generateLlmsSourceName(url);
  
  // Create docs directory
  const docsPath = path.join(process.cwd(), options.docsDir, sourceName);
  try {
    await fs.mkdir(docsPath, { recursive: true });
  } catch (error: any) {
    throw new Error(`Failed to create docs directory: ${error.message}`);
  }

  onProgress?.(0, 1, path.basename(url));

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'agent-md-tool/1.0',
        'Accept': 'text/plain, text/markdown, */*'
      },
      timeout: 30000,
      responseType: 'text'
    });

    const content = response.data;
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(`Empty or invalid llms.txt file at ${url}`);
    }

    // Determine filename from URL
    const filename = url.toLowerCase().includes('llms.txt') ? 'llms.txt' : 'llm.txt';
    const filePath = path.join(docsPath, filename);
    
    // Add source URL as comment at top (if it's not already markdown)
    const hasMarkdownHeader = content.trim().startsWith('#');
    const finalContent = hasMarkdownHeader 
      ? `<!-- Source: ${url} -->\n\n${content}`
      : `<!-- Source: ${url} -->\n\n# LLMs.txt\n\n${content}`;
    
    await fs.writeFile(filePath, finalContent, 'utf-8');
    
    onProgress?.(1, 1, filename);

    return {
      totalFiles: 1,
      downloadedFiles: 1,
      docsPath,
      sourceName
    };

  } catch (error: any) {
    // Re-throw validation errors (thrown before network request) without wrapping
    if (error.message?.includes('Empty or invalid llms.txt')) {
      throw error;
    }
    // Handle network/HTTP errors
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Timeout fetching ${url}`);
    }
    if (error.response?.status === 404) {
      throw new Error(
        `llms.txt not found at ${url}\n\n` +
        `Make sure the URL is correct and the file exists.`
      );
    }
    if (error.response?.status === 403) {
      throw new Error(`Access denied to ${url}`);
    }
    throw new Error(`Failed to download llms.txt: ${error.message}`);
  }
}
