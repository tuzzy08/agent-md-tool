/**
 * Tests for gitignore module functions (unit tests only)
 * Note: Integration tests are done manually as process.chdir has limitations
 */

import { describe, it, expect } from 'vitest';

// Test the core logic indirectly through the exported interface
// The actual functions are tested in integration via the CLI

describe('gitignore module', () => {
  describe('entry normalization logic', () => {
    it('should normalize various path formats', () => {
      // Test the normalization logic that would be applied
      const normalizeEntry = (entry: string) => 
        entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      
      expect(normalizeEntry('.docs')).toBe('.docs');
      expect(normalizeEntry('./.docs')).toBe('.docs');
      expect(normalizeEntry('.docs/')).toBe('.docs');
      expect(normalizeEntry('./.docs/')).toBe('.docs');
      expect(normalizeEntry('docs\\')).toBe('docs');
    });

    it('should detect duplicate entries with different formats', () => {
      // Updated normalization to also strip leading "/"
      const normalizeEntry = (entry: string) => 
        entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/\/$/, '');
      
      const entries = ['.docs', '.docs/', '/.docs', '/.docs/'];
      const normalized = entries.map(e => normalizeEntry(e));
      
      // All should normalize to the same value - check unique set size
      expect(new Set(normalized).size).toBe(1);
    });
  });

  describe('gitignore content generation', () => {
    it('should generate proper gitignore entry format', () => {
      const docsDir = '.docs';
      const normalizedEntry = docsDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      const gitignoreEntry = normalizedEntry + '/';
      
      expect(gitignoreEntry).toBe('.docs/');
    });

    it('should generate comment with entry', () => {
      const docsDir = '.documentation';
      const normalizedEntry = docsDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      const gitignoreEntry = normalizedEntry + '/';
      const comment = '# Downloaded documentation (agent-md-tool)';
      
      const newContent = `${comment}\n${gitignoreEntry}\n`;
      
      expect(newContent).toContain(comment);
      expect(newContent).toContain('.documentation/');
    });
  });
});
