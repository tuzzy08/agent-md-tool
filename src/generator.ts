/**
 * Generator module - creates and updates AGENTS.md files
 */

import fs from 'fs/promises';
import path from 'path';
import { getProjectContext } from './project.js';

const START_MARKER_PREFIX = '<!-- DOCS-INDEX-START:';
const END_MARKER_PREFIX = '<!-- DOCS-INDEX-END:';
const MARKER_SUFFIX = ' -->';

/**
 * Generate the start marker for a source
 */
export function getStartMarker(sourceName: string): string {
  return `${START_MARKER_PREFIX}${sourceName}${MARKER_SUFFIX}`;
}

/**
 * Generate the end marker for a source
 */
export function getEndMarker(sourceName: string): string {
  return `${END_MARKER_PREFIX}${sourceName}${MARKER_SUFFIX}`;
}

/**
 * Create a new AGENTS.md file template with inferred project info
 */
async function createNewFileContent(outputFile: string): Promise<string> {
  const fileName = path.basename(outputFile, path.extname(outputFile));
  
  // Get project context from package.json
  const context = await getProjectContext();
  
  return `# ${fileName}

This file provides context and instructions for AI coding agents.

${context.overview}

${context.setup}

## Code Style

<!-- Add your code style guidelines here -->
- Use TypeScript strict mode
- Follow existing patterns in the codebase

## Testing

<!-- Add testing instructions here -->

## Documentation Indexes

The following documentation indexes are auto-generated. Do not edit manually.

`;
}

/**
 * Generate the doc index block with markers
 */
export function generateIndexBlock(
  sourceName: string,
  displayName: string,
  rootPath: string,
  compressedIndex: string
): string {
  return `${getStartMarker(sourceName)}
[${displayName}]
root: ${rootPath}

IMPORTANT: Use retrieval-led reasoning. When you need ${displayName} information, read files from the root directory above.

${compressedIndex}
${getEndMarker(sourceName)}`;
}

/**
 * Update existing content by replacing or appending the index block
 */
export function updateContent(
  existingContent: string,
  sourceName: string,
  indexBlock: string
): string {
  const startMarker = getStartMarker(sourceName);
  const endMarker = getEndMarker(sourceName);
  
  const startIdx = existingContent.indexOf(startMarker);
  const endIdx = existingContent.indexOf(endMarker);
  
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    // Replace existing block
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + endMarker.length);
    return before + indexBlock + after;
  } else if (startIdx !== -1 && endIdx === -1) {
    // Malformed: has start but no end marker
    throw new Error(
      `Malformed documentation index found for "${sourceName}".\n\n` +
      `Found start marker but missing end marker.\n` +
      `Please manually fix or remove the incomplete block in your output file.`
    );
  } else {
    // Append new block
    const trimmed = existingContent.trimEnd();
    return trimmed + '\n\n' + indexBlock + '\n';
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a display name from source name
 */
export function formatDisplayName(sourceName: string): string {
  return sourceName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validate source name
 */
function validateSourceName(sourceName: string): void {
  if (!sourceName || sourceName.trim() === '') {
    throw new Error('Source name cannot be empty');
  }
  
  if (sourceName.length > 100) {
    throw new Error('Source name is too long (max 100 characters)');
  }
  
  // Check for characters that could break markers
  if (sourceName.includes('-->') || sourceName.includes('<!--')) {
    throw new Error('Source name cannot contain HTML comment markers');
  }
}

/**
 * Main generator function - creates or updates the output file
 */
export async function generateAgentsMd(
  outputPath: string,
  sourceName: string,
  docsDir: string,
  compressedIndex: string
): Promise<{ created: boolean; updated: boolean }> {
  // Validate inputs
  validateSourceName(sourceName);
  
  if (!compressedIndex || compressedIndex.trim() === '') {
    throw new Error('Cannot generate empty index. Please ensure documentation was downloaded.');
  }
  
  const fullPath = path.resolve(process.cwd(), outputPath);
  const exists = await fileExists(fullPath);
  
  // Calculate relative path to docs directory
  const outputDir = path.dirname(fullPath);
  const absoluteDocsDir = path.resolve(process.cwd(), docsDir, sourceName);
  const relativePath = './' + path.relative(outputDir, absoluteDocsDir).replace(/\\/g, '/');
  
  // Generate the index block
  const displayName = formatDisplayName(sourceName);
  const indexBlock = generateIndexBlock(sourceName, displayName, relativePath, compressedIndex);
  
  let content: string;
  let created = false;
  let updated = false;
  
  if (exists) {
    // Read existing content and update
    try {
      const existingContent = await fs.readFile(fullPath, 'utf-8');
      const hadExistingBlock = existingContent.includes(getStartMarker(sourceName));
      content = updateContent(existingContent, sourceName, indexBlock);
      updated = hadExistingBlock;
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new Error(
          `Permission denied reading ${outputPath}\n\n` +
          `Please check file permissions.`
        );
      }
      throw error;
    }
  } else {
    // Create new file with inferred project info
    content = await createNewFileContent(outputPath) + indexBlock + '\n';
    created = true;
  }
  
  // Write the file
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  } catch (error: any) {
    if (error.code === 'EACCES') {
      throw new Error(
        `Permission denied writing to ${outputPath}\n\n` +
        `Please check file permissions.`
      );
    }
    if (error.code === 'ENOSPC') {
      throw new Error(
        `Disk full: Cannot write to ${outputPath}\n\n` +
        `Please free up disk space and try again.`
      );
    }
    throw new Error(`Failed to write file: ${error.message}`);
  }
  
  return { created, updated };
}

/**
 * List all documentation sources in an existing file
 */
export async function listSources(outputPath: string): Promise<string[]> {
  const fullPath = path.resolve(process.cwd(), outputPath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const regex = new RegExp(
      `${START_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\s]+)${MARKER_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'g'
    );
    
    const sources: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      sources.push(match[1]);
    }
    
    return sources;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error(`Failed to read ${outputPath}: ${error.message}`);
  }
}

/**
 * Remove a documentation source from the file
 */
export async function removeSource(outputPath: string, sourceName: string): Promise<boolean> {
  const fullPath = path.resolve(process.cwd(), outputPath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const startMarker = getStartMarker(sourceName);
    const endMarker = getEndMarker(sourceName);
    
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    
    if (startIdx === -1 || endIdx === -1) {
      return false; // Source not found
    }
    
    // Remove the block including surrounding whitespace
    let before = content.substring(0, startIdx);
    let after = content.substring(endIdx + endMarker.length);
    
    // Clean up extra newlines
    before = before.replace(/\n+$/, '\n');
    after = after.replace(/^\n+/, '\n');
    
    const newContent = before + after;
    await fs.writeFile(fullPath, newContent, 'utf-8');
    
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${outputPath}`);
    }
    throw new Error(`Failed to remove source: ${error.message}`);
  }
}
