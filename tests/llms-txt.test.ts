/**
 * Tests for llms.txt module
 */

import { describe, it, expect } from 'vitest';
import { isLlmsTxtUrl, generateLlmsSourceName } from '../src/llms-txt.js';

describe('isLlmsTxtUrl', () => {
  it('should identify llms.txt URLs', () => {
    expect(isLlmsTxtUrl('https://example.com/llms.txt')).toBe(true);
    expect(isLlmsTxtUrl('https://example.com/folder/llms.txt')).toBe(true);
    expect(isLlmsTxtUrl('https://example.com/llm.txt')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isLlmsTxtUrl('https://example.com/LLMS.TXT')).toBe(true);
  });

  it('should reject non-llms.txt URLs', () => {
    expect(isLlmsTxtUrl('https://example.com/docs')).toBe(false);
    expect(isLlmsTxtUrl('https://github.com/owner/repo')).toBe(false);
    expect(isLlmsTxtUrl('https://example.com/readme.md')).toBe(false);
  });
});

describe('generateLlmsSourceName', () => {
  it('should generate source name from URL domain', () => {
    expect(generateLlmsSourceName('https://example.com/llms.txt')).toBe('example-llms');
    expect(generateLlmsSourceName('https://www.test.org/llms.txt')).toBe('test-llms');
  });

  it('should handle complex domains', () => {
    expect(generateLlmsSourceName('https://docs.api.service.com/llms.txt')).toBe('docs-llms');
  });

  it('should sanitize special characters', () => {
    expect(generateLlmsSourceName('https://my-site_v2.com/llms.txt')).toBe('my-site-v2-llms');
  });
});
