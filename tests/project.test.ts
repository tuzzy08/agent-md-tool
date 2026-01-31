/**
 * Tests for project inference module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { inferCommands, readPackageJson, generateSetupSection, generateOverviewSection } from '../src/project.js';

let testDir: string;

beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `agent-md-project-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('inferCommands', () => {
  it('should detect common scripts with npm', () => {
    const scripts = {
      dev: 'next dev',
      build: 'next build',
      test: 'jest',
      lint: 'eslint .'
    };
    
    const commands = inferCommands(scripts, 'npm');
    
    expect(commands.install).toBe('npm install');
    expect(commands.dev).toBe('npm run dev');
    expect(commands.build).toBe('npm run build');
    expect(commands.test).toBe('npm run test');
    expect(commands.lint).toBe('npm run lint');
  });

  it('should use pnpm format for pnpm', () => {
    const scripts = { dev: 'vite', build: 'vite build' };
    const commands = inferCommands(scripts, 'pnpm');
    
    expect(commands.install).toBe('pnpm install');
    expect(commands.dev).toBe('pnpm dev');
    expect(commands.build).toBe('pnpm build');
  });

  it('should use yarn format for yarn', () => {
    const scripts = { start: 'node server.js' };
    const commands = inferCommands(scripts, 'yarn');
    
    expect(commands.install).toBe('yarn install');
    expect(commands.dev).toBe('yarn start');
  });

  it('should handle missing scripts gracefully', () => {
    const scripts = { custom: 'echo custom' };
    const commands = inferCommands(scripts, 'npm');
    
    expect(commands.install).toBe('npm install');
    expect(commands.dev).toBe('');
    expect(commands.build).toBe('');
  });

  it('should prefer dev over start', () => {
    const scripts = { start: 'node index.js', dev: 'nodemon index.js' };
    const commands = inferCommands(scripts, 'npm');
    
    expect(commands.dev).toBe('npm run dev');
  });
});

describe('readPackageJson', () => {
  it('should read package.json from directory', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      description: 'A test project',
      scripts: { test: 'jest' }
    }));

    const info = await readPackageJson(testDir);
    
    expect(info).not.toBeNull();
    expect(info!.name).toBe('test-project');
    expect(info!.description).toBe('A test project');
    expect(info!.scripts.test).toBe('jest');
  });

  it('should return null for missing package.json', async () => {
    const info = await readPackageJson(testDir);
    expect(info).toBeNull();
  });

  it('should handle missing fields gracefully', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'minimal'
    }));

    const info = await readPackageJson(testDir);
    
    expect(info!.name).toBe('minimal');
    expect(info!.description).toBe('');
    expect(info!.scripts).toEqual({});
  });
});

describe('generateSetupSection', () => {
  it('should generate setup section from package.json', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'test',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        test: 'jest'
      }
    }));

    const section = await generateSetupSection(testDir);
    
    expect(section).toContain('## Setup Commands');
    expect(section).toContain('npm install');
    expect(section).toContain('npm run dev');
    expect(section).toContain('npm run build');
    expect(section).toContain('npm run test');
  });

  it('should generate placeholder for missing package.json', async () => {
    const section = await generateSetupSection(testDir);
    
    expect(section).toContain('## Setup Commands');
    expect(section).toContain('# Add your setup commands here');
  });
});

describe('generateOverviewSection', () => {
  it('should include description from package.json', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'test',
      description: 'An amazing project that does things'
    }));

    const section = await generateOverviewSection(testDir);
    
    expect(section).toContain('## Project Overview');
    expect(section).toContain('An amazing project that does things');
  });

  it('should generate placeholder for missing description', async () => {
    const section = await generateOverviewSection(testDir);
    
    expect(section).toContain('## Project Overview');
    expect(section).toContain('<!-- Add your project description here -->');
  });
});
