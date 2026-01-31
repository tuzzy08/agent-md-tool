/**
 * Project module - infers project information from package.json and other sources
 */

import fs from 'fs/promises';
import path from 'path';

export interface ProjectInfo {
  name: string;
  description: string;
  scripts: Record<string, string>;
  repository?: string;
}

export interface InferredCommands {
  install: string;
  dev: string;
  build: string;
  test: string;
  lint: string;
}

/**
 * Common script patterns and their display names
 */
const SCRIPT_PATTERNS: Record<keyof InferredCommands, string[]> = {
  install: ['install', 'setup', 'bootstrap'],
  dev: ['dev', 'start', 'serve', 'develop', 'watch'],
  build: ['build', 'compile', 'bundle'],
  test: ['test', 'test:unit', 'test:all', 'jest', 'vitest'],
  lint: ['lint', 'lint:fix', 'check', 'format']
};

/**
 * Detect which package manager is being used
 */
async function detectPackageManager(projectDir: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
  const lockFiles = [
    { file: 'bun.lockb', manager: 'bun' as const },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
    { file: 'yarn.lock', manager: 'yarn' as const },
    { file: 'package-lock.json', manager: 'npm' as const }
  ];

  for (const { file, manager } of lockFiles) {
    try {
      await fs.access(path.join(projectDir, file));
      return manager;
    } catch {
      continue;
    }
  }

  return 'npm'; // Default
}

/**
 * Find the best matching script for a category
 */
function findScript(scripts: Record<string, string>, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (scripts[pattern]) {
      return pattern;
    }
  }
  return null;
}

/**
 * Infer common commands from package.json scripts
 */
export function inferCommands(
  scripts: Record<string, string>,
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'
): InferredCommands {
  const run = packageManager === 'npm' ? 'npm run' : packageManager;
  const installCmd = packageManager === 'npm' ? 'npm install' : `${packageManager} install`;

  const commands: InferredCommands = {
    install: installCmd,
    dev: '',
    build: '',
    test: '',
    lint: ''
  };

  for (const [category, patterns] of Object.entries(SCRIPT_PATTERNS)) {
    if (category === 'install') continue;
    
    const script = findScript(scripts, patterns);
    if (script) {
      commands[category as keyof InferredCommands] = `${run} ${script}`;
    }
  }

  return commands;
}

/**
 * Read and parse package.json from the current project
 */
export async function readPackageJson(projectDir: string = process.cwd()): Promise<ProjectInfo | null> {
  const packagePath = path.join(projectDir, 'package.json');

  try {
    const content = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);

    return {
      name: pkg.name || path.basename(projectDir),
      description: pkg.description || '',
      scripts: pkg.scripts || {},
      repository: typeof pkg.repository === 'string' 
        ? pkg.repository 
        : pkg.repository?.url
    };
  } catch {
    return null;
  }
}

/**
 * Generate setup commands section from inferred project info
 */
export async function generateSetupSection(projectDir: string = process.cwd()): Promise<string> {
  const projectInfo = await readPackageJson(projectDir);
  
  if (!projectInfo || Object.keys(projectInfo.scripts).length === 0) {
    return `## Setup Commands

\`\`\`bash
# Add your setup commands here
npm install
npm run dev
\`\`\``;
  }

  const packageManager = await detectPackageManager(projectDir);
  const commands = inferCommands(projectInfo.scripts, packageManager);

  const lines: string[] = ['## Setup Commands', '', '```bash'];
  
  // Install
  lines.push(`# Install dependencies`);
  lines.push(commands.install);
  
  // Dev
  if (commands.dev) {
    lines.push('');
    lines.push('# Start development server');
    lines.push(commands.dev);
  }
  
  // Build
  if (commands.build) {
    lines.push('');
    lines.push('# Build for production');
    lines.push(commands.build);
  }
  
  // Test
  if (commands.test) {
    lines.push('');
    lines.push('# Run tests');
    lines.push(commands.test);
  }
  
  // Lint
  if (commands.lint) {
    lines.push('');
    lines.push('# Lint code');
    lines.push(commands.lint);
  }
  
  lines.push('```');
  
  return lines.join('\n');
}

/**
 * Generate project overview section from package.json
 */
export async function generateOverviewSection(projectDir: string = process.cwd()): Promise<string> {
  const projectInfo = await readPackageJson(projectDir);
  
  if (!projectInfo || !projectInfo.description) {
    return `## Project Overview

<!-- Add your project description here -->`;
  }

  return `## Project Overview

${projectInfo.description}`;
}

/**
 * Get full project context for AGENTS.md generation
 */
export async function getProjectContext(projectDir: string = process.cwd()): Promise<{
  overview: string;
  setup: string;
  projectName: string;
}> {
  const projectInfo = await readPackageJson(projectDir);
  
  return {
    overview: await generateOverviewSection(projectDir),
    setup: await generateSetupSection(projectDir),
    projectName: projectInfo?.name || path.basename(projectDir)
  };
}
