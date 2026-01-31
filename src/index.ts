#!/usr/bin/env node

/**
 * agent-md-tool - CLI tool to download documentation and embed indexes in AGENTS.md
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { downloadDocs, parseGitHubUrl, generateSourceName } from './downloader.js';
import { downloadLlmsTxt, isLlmsTxtUrl, generateLlmsSourceName } from './llms-txt.js';
import { createIndex, getIndexStats } from './indexer.js';
import { generateAgentsMd, listSources, removeSource } from './generator.js';
import { addToGitignore } from './gitignore.js';
import type { CliOptions } from './types.js';

const program = new Command();

/**
 * Format error message for display
 */
function formatError(error: Error): string {
  return error.message
    .split('\n')
    .map((line, i) => i === 0 ? chalk.red(`✖ ${line}`) : chalk.dim(`  ${line}`))
    .join('\n');
}

/**
 * Determine source type from URL
 */
function getSourceType(source: string): 'github' | 'llms-txt' | 'unknown' {
  if (source.includes('github.com')) {
    return 'github';
  }
  if (isLlmsTxtUrl(source)) {
    return 'llms-txt';
  }
  return 'unknown';
}

/**
 * Show auto-detected path message
 */
function showAutoDetectMessage(detectedPath: string | undefined): void {
  if (detectedPath) {
    console.log(chalk.dim(`  ℹ️  Auto-detected documentation folder: ${chalk.cyan(detectedPath)}`));
  }
}

program
  .name('agent-md-tool')
  .description('Download documentation and embed compressed indexes into AGENTS.md files')
  .version('1.0.0');

// Main command - download and generate in one step
program
  .argument('<source>', 'Documentation source (GitHub URL or URL ending in /llms.txt)')
  .option('-o, --output <file>', 'Output file (AGENTS.md, CLAUDE.md, etc.)', 'AGENTS.md')
  .option('-d, --docs-dir <path>', 'Directory to store downloaded docs', '.docs')
  .option('-p, --path <path>', 'Subdirectory in repo to download (GitHub only)', '')
  .option('-n, --source-name <name>', 'Custom name for the documentation source')
  .option('-b, --branch <branch>', 'Git branch to download from (GitHub only)', 'main')
  .action(async (source: string, cmdOptions: CliOptions) => {
    console.log(chalk.bold.cyan('\n🤖 agent-md-tool\n'));

    const options: CliOptions = {
      output: cmdOptions.output,
      docsDir: cmdOptions.docsDir,
      path: cmdOptions.path || '', // Ensure empty string if not provided
      sourceName: cmdOptions.sourceName,
      branch: cmdOptions.branch
    };

    try {
      const sourceType = getSourceType(source);
      let result: { downloadedFiles: number; docsPath: string; sourceName: string; totalFiles: number; detectedPath?: string };
      
      if (sourceType === 'github') {
        // GitHub repository
        const spinner = ora('Parsing GitHub URL...').start();
        const { owner, repo } = parseGitHubUrl(source);
        const sourceName = options.sourceName || generateSourceName(owner, repo);
        spinner.succeed(`Repository: ${chalk.green(`${owner}/${repo}`)}`);

        const downloadSpinner = ora('Downloading documentation...').start();
        
        result = await downloadDocs(source, options, (current, total, file) => {
          downloadSpinner.text = `Downloading (${current}/${total}): ${file}`;
        });
        
        downloadSpinner.succeed(`Downloaded ${chalk.green(result.downloadedFiles)} files to ${chalk.cyan(result.docsPath)}`);
        
        // Show auto-detected path info
        showAutoDetectMessage(result.detectedPath);

      } else if (sourceType === 'llms-txt') {
        // llms.txt file
        const spinner = ora('Fetching llms.txt...').start();
        spinner.succeed(`Source: ${chalk.green(source)}`);
        
        const downloadSpinner = ora('Downloading file...').start();
        
        result = await downloadLlmsTxt(source, options, (current, total, file) => {
          downloadSpinner.text = `Downloading: ${file}`;
        });
        
        downloadSpinner.succeed(`Downloaded ${chalk.green(result.downloadedFiles)} file to ${chalk.cyan(result.docsPath)}`);
        
      } else {
        throw new Error(
          `Invalid source: "${source}"\n\n` +
          `Supported sources:\n` +
          `  • GitHub URL (e.g. https://github.com/owner/repo)\n` +
          `  • llms.txt URL (e.g. https://example.com/llms.txt)`
        );
      }

      // Add docs directory to .gitignore
      const addedToGitignore = await addToGitignore(options.docsDir);
      if (addedToGitignore) {
        console.log(chalk.dim(`  Added ${options.docsDir}/ to .gitignore`));
      }

      // Create index
      const indexSpinner = ora('Creating compressed index...').start();
      const compressedIndex = await createIndex(result.docsPath);
      const stats = await getIndexStats(result.docsPath);
      indexSpinner.succeed(`Indexed ${chalk.green(stats.fileCount)} files in ${chalk.green(stats.dirCount)} directories`);

      // Generate/update output file
      const genSpinner = ora(`Updating ${options.output}...`).start();
      const genResult = await generateAgentsMd(options.output, result.sourceName, options.docsDir, compressedIndex);
      
      if (genResult.created) {
        genSpinner.succeed(`Created ${chalk.green(options.output)} (with project info from package.json)`);
      } else if (genResult.updated) {
        genSpinner.succeed(`Updated existing index in ${chalk.green(options.output)}`);
      } else {
        genSpinner.succeed(`Added new index to ${chalk.green(options.output)}`);
      }

      // Done!
      console.log(chalk.bold.green('\n✓ Done!\n'));
      console.log(chalk.dim('Documentation has been downloaded and indexed.'));
      console.log(chalk.dim(`AI agents can now use ${options.output} for retrieval-led reasoning.\n`));

    } catch (error: any) {
      console.error('\n' + formatError(error) + '\n');
      process.exit(1);
    }
  });

// List command - show all indexed sources
program
  .command('list')
  .description('List all documentation sources in the output file')
  .option('-o, --output <file>', 'Output file to check', 'AGENTS.md')
  .action(async (options: { output: string }) => {
    try {
      const sources = await listSources(options.output);
      
      if (sources.length === 0) {
        console.log(chalk.yellow(`\nNo documentation sources found in ${options.output}\n`));
        console.log(chalk.dim('Add documentation using:'));
        console.log(chalk.dim('  agent-md-tool https://github.com/owner/repo'));
        console.log(chalk.dim('  agent-md-tool https://example.com/llms.txt\n'));
      } else {
        console.log(chalk.bold.cyan(`\n📚 Documentation sources in ${options.output}:\n`));
        sources.forEach((source, index) => {
          console.log(`  ${chalk.dim(`${index + 1}.`)} ${chalk.green(source)}`);
        });
        console.log();
      }
    } catch (error: any) {
      console.error('\n' + formatError(error) + '\n');
      process.exit(1);
    }
  });

// Remove command - remove a documentation source
program
  .command('remove <source-name>')
  .description('Remove a documentation source from the output file')
  .option('-o, --output <file>', 'Output file to modify', 'AGENTS.md')
  .action(async (sourceName: string, options: { output: string }) => {
    try {
      const spinner = ora(`Removing ${sourceName}...`).start();
      const removed = await removeSource(options.output, sourceName);
      
      if (removed) {
        spinner.succeed(`Removed ${chalk.green(sourceName)} from ${options.output}`);
        console.log(chalk.dim('\nNote: The downloaded documentation files are still in .docs/'));
        console.log(chalk.dim('You can delete them manually if no longer needed.\n'));
      } else {
        spinner.fail(`Source "${sourceName}" not found in ${options.output}`);
        
        // Show available sources
        const sources = await listSources(options.output);
        if (sources.length > 0) {
          console.log(chalk.dim('\nAvailable sources:'));
          sources.forEach(s => console.log(chalk.dim(`  • ${s}`)));
        }
        console.log();
        process.exit(1);
      }
    } catch (error: any) {
      console.error('\n' + formatError(error) + '\n');
      process.exit(1);
    }
  });

program.parse();
