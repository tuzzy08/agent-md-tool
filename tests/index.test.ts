/**
 * Tests for agent-md-tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Import modules to test
import { parseGitHubUrl, generateSourceName } from '../src/downloader.js';
import { groupByDirectory, generateCompressedIndex, createIndex } from '../src/indexer.js';
import {
  getStartMarker,
  getEndMarker,
  formatDisplayName,
  generateIndexBlock,
  updateContent,
  generateAgentsMd,
  listSources,
  removeSource
} from '../src/generator.js';

// Test directory for file operations
let testDir: string;

beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `agent-md-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ============================================================
// Downloader Tests
// ============================================================

describe('parseGitHubUrl', () => {
  it('should parse basic GitHub URL', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo');
    expect(result.owner).toBe('owner');
    expect(result.repo).toBe('repo');
    expect(result.branch).toBe('');
  });

  it('should parse GitHub URL with branch', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/develop');
    expect(result.owner).toBe('owner');
    expect(result.repo).toBe('repo');
    expect(result.branch).toBe('develop');
  });

  it('should handle URL without https', () => {
    const result = parseGitHubUrl('github.com/owner/repo');
    expect(result.owner).toBe('owner');
    expect(result.repo).toBe('repo');
  });

  it('should handle URL with trailing slash', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/');
    expect(result.owner).toBe('owner');
    expect(result.repo).toBe('repo');
  });

  it('should handle URL with .git suffix', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo.git');
    expect(result.owner).toBe('owner');
    expect(result.repo).toBe('repo');
  });

  it('should throw for invalid URL', () => {
    expect(() => parseGitHubUrl('https://example.com/something')).toThrow('Invalid GitHub URL');
    expect(() => parseGitHubUrl('not-a-url')).toThrow('Invalid GitHub URL');
  });
});

describe('generateSourceName', () => {
  it('should generate lowercase source name with -docs suffix', () => {
    expect(generateSourceName('owner', 'MyRepo')).toBe('myrepo-docs');
  });

  it('should sanitize special characters', () => {
    expect(generateSourceName('owner', 'my_repo.js')).toBe('my-repo-js-docs');
  });
});

// ============================================================
// Indexer Tests
// ============================================================

describe('groupByDirectory', () => {
  it('should group files by parent directory', () => {
    const files = ['readme.md', 'docs/guide.md', 'docs/api.md', 'docs/deep/nested.md'];
    const result = groupByDirectory(files);
    
    expect(result['']).toEqual(['readme.md']);
    expect(result['docs']).toEqual(['guide.md', 'api.md']);
    expect(result['docs/deep']).toEqual(['nested.md']);
  });

  it('should handle empty array', () => {
    const result = groupByDirectory([]);
    expect(Object.keys(result).length).toBe(0);
  });

  it('should handle single root file', () => {
    const result = groupByDirectory(['readme.md']);
    expect(result['']).toEqual(['readme.md']);
  });
});

describe('generateCompressedIndex', () => {
  it('should generate pipe-delimited format', () => {
    const grouped = {
      '': ['readme.md'],
      'docs': ['guide.md', 'api.md']
    };
    const result = generateCompressedIndex(grouped, '/path/to/my-docs');
    
    expect(result).toContain('my-docs:{readme.md}');
    expect(result).toContain('my-docs/docs:{api.md,guide.md}');
  });

  it('should sort files alphabetically', () => {
    const grouped = { '': ['z.md', 'a.md', 'm.md'] };
    const result = generateCompressedIndex(grouped, '/path/to/docs');
    
    expect(result).toBe('docs:{a.md,m.md,z.md}');
  });
});

describe('createIndex', () => {
  it('should index markdown files in directory', async () => {
    // Create test files
    await fs.writeFile(path.join(testDir, 'readme.md'), '# Test');
    await fs.mkdir(path.join(testDir, 'docs'));
    await fs.writeFile(path.join(testDir, 'docs', 'guide.md'), '# Guide');
    
    const result = await createIndex(testDir);
    
    expect(result).toContain('readme.md');
    expect(result).toContain('guide.md');
  });

  it('should throw for non-existent directory', async () => {
    await expect(createIndex('/nonexistent/path')).rejects.toThrow('not found');
  });

  it('should throw for empty directory', async () => {
    await expect(createIndex(testDir)).rejects.toThrow('No markdown files');
  });

  it('should skip hidden directories', async () => {
    await fs.mkdir(path.join(testDir, '.hidden'));
    await fs.writeFile(path.join(testDir, '.hidden', 'secret.md'), '# Secret');
    await fs.writeFile(path.join(testDir, 'visible.md'), '# Visible');
    
    const result = await createIndex(testDir);
    
    expect(result).toContain('visible.md');
    expect(result).not.toContain('secret.md');
  });
});

// ============================================================
// Generator Tests
// ============================================================

describe('getStartMarker / getEndMarker', () => {
  it('should generate valid HTML comment markers', () => {
    expect(getStartMarker('my-source')).toBe('<!-- DOCS-INDEX-START:my-source -->');
    expect(getEndMarker('my-source')).toBe('<!-- DOCS-INDEX-END:my-source -->');
  });
});

describe('formatDisplayName', () => {
  it('should capitalize each word', () => {
    expect(formatDisplayName('my-cool-docs')).toBe('My Cool Docs');
    expect(formatDisplayName('react-docs')).toBe('React Docs');
  });

  it('should handle single word', () => {
    expect(formatDisplayName('docs')).toBe('Docs');
  });
});

describe('generateIndexBlock', () => {
  it('should create valid index block with markers', () => {
    const result = generateIndexBlock('my-docs', 'My Docs', './.docs/my-docs', 'my-docs:{readme.md}');
    
    expect(result).toContain('<!-- DOCS-INDEX-START:my-docs -->');
    expect(result).toContain('<!-- DOCS-INDEX-END:my-docs -->');
    expect(result).toContain('[My Docs]');
    expect(result).toContain('root: ./.docs/my-docs');
    expect(result).toContain('my-docs:{readme.md}');
  });
});

describe('updateContent', () => {
  it('should append new block to content', () => {
    const existing = '# AGENTS.md\n\nSome content';
    const block = '<!-- DOCS-INDEX-START:new -->\nindex\n<!-- DOCS-INDEX-END:new -->';
    
    const result = updateContent(existing, 'new', block);
    
    expect(result).toContain('# AGENTS.md');
    expect(result).toContain('Some content');
    expect(result).toContain(block);
  });

  it('should replace existing block', () => {
    const existing = `# AGENTS.md

<!-- DOCS-INDEX-START:old -->
old content
<!-- DOCS-INDEX-END:old -->

Other stuff`;
    const newBlock = '<!-- DOCS-INDEX-START:old -->\nnew content\n<!-- DOCS-INDEX-END:old -->';
    
    const result = updateContent(existing, 'old', newBlock);
    
    expect(result).toContain('new content');
    expect(result).not.toContain('old content');
    expect(result).toContain('Other stuff');
  });

  it('should throw for malformed markers', () => {
    const malformed = '# AGENTS.md\n<!-- DOCS-INDEX-START:broken -->\nno end marker';
    
    expect(() => updateContent(malformed, 'broken', 'new')).toThrow('Malformed');
  });
});

describe('generateAgentsMd', () => {
  it('should create new file when none exists', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    const docsDir = path.join(testDir, '.docs');
    await fs.mkdir(path.join(docsDir, 'my-docs'), { recursive: true });
    
    const result = await generateAgentsMd(outputPath, 'my-docs', docsDir, 'my-docs:{readme.md}');
    
    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
    
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('# AGENTS');
    expect(content).toContain('<!-- DOCS-INDEX-START:my-docs -->');
  });

  it('should append to existing file', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(outputPath, '# My Agents\n\nCustom content here');
    
    const docsDir = path.join(testDir, '.docs');
    await fs.mkdir(path.join(docsDir, 'new-docs'), { recursive: true });
    
    const result = await generateAgentsMd(outputPath, 'new-docs', docsDir, 'new-docs:{readme.md}');
    
    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('# My Agents');
    expect(content).toContain('Custom content here');
    expect(content).toContain('<!-- DOCS-INDEX-START:new-docs -->');
  });

  it('should update existing source', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(outputPath, `# AGENTS

<!-- DOCS-INDEX-START:my-docs -->
old content
<!-- DOCS-INDEX-END:my-docs -->`);
    
    const docsDir = path.join(testDir, '.docs');
    await fs.mkdir(path.join(docsDir, 'my-docs'), { recursive: true });
    
    const result = await generateAgentsMd(outputPath, 'my-docs', docsDir, 'my-docs:{new.md}');
    
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('my-docs:{new.md}');
    expect(content).not.toContain('old content');
  });
});

describe('listSources', () => {
  it('should list all sources in file', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(outputPath, `
<!-- DOCS-INDEX-START:source1 -->
content1
<!-- DOCS-INDEX-END:source1 -->

<!-- DOCS-INDEX-START:source2 -->
content2
<!-- DOCS-INDEX-END:source2 -->
`);
    
    const sources = await listSources(outputPath);
    
    expect(sources).toContain('source1');
    expect(sources).toContain('source2');
    expect(sources.length).toBe(2);
  });

  it('should return empty array for non-existent file', async () => {
    const sources = await listSources('/nonexistent/file.md');
    expect(sources).toEqual([]);
  });
});

describe('removeSource', () => {
  it('should remove source from file', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(outputPath, `# AGENTS

<!-- DOCS-INDEX-START:keep -->
keep this
<!-- DOCS-INDEX-END:keep -->

<!-- DOCS-INDEX-START:remove -->
remove this
<!-- DOCS-INDEX-END:remove -->
`);
    
    const removed = await removeSource(outputPath, 'remove');
    
    expect(removed).toBe(true);
    
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('keep this');
    expect(content).not.toContain('remove this');
  });

  it('should return false if source not found', async () => {
    const outputPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(outputPath, '# AGENTS\n\nNo sources here');
    
    const removed = await removeSource(outputPath, 'nonexistent');
    
    expect(removed).toBe(false);
  });
});
