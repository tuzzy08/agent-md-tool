# agent-md-tool

[![npm version](https://badge.fury.io/js/agent-md-tool.svg)](https://www.npmjs.com/package/agent-md-tool)

A CLI tool to download documentation from GitHub repositories or LLMs.txt files, then embed compressed indexes into AGENTS.md files for AI agents.

## What is AGENTS.md?

[AGENTS.md](https://agents.md) is an open standard that provides a dedicated place for AI coding agents to find project-specific context and instructions. This tool helps you embed external documentation (like framework docs) into your AGENTS.md file, enabling "retrieval-led reasoning" where agents reference actual documentation instead of relying on potentially outdated training data.

## Installation

```bash
npm install -g agent-md-tool
```

Or use directly with npx:

```bash
npx agent-md-tool <source> [options]
```

## Usage

### Download from GitHub

```bash
# Basic usage - download docs and create AGENTS.md
# Automatically detects 'docs', 'documentation', etc. folders
agent-md-tool https://github.com/vercel/next.js

# Target a specific subdirectory
agent-md-tool https://github.com/vercel/next.js --path docs/app

# Specify output format (CLAUDE.md, AGENTS.md, etc.)
agent-md-tool https://github.com/langchain-ai/langchain --output CLAUDE.md

# Specify a branch
agent-md-tool https://github.com/owner/repo --branch develop
```

### Download from llms.txt

The tool supports downloading directly from standard [llms.txt](https://llmstxt.org/) files:

```bash
agent-md-tool https://example.com/llms.txt
agent-md-tool https://example.com/llm.txt
```

### Options

| Option          | Alias | Description                                    | Default        |
| --------------- | ----- | ---------------------------------------------- | -------------- |
| `--output`      | `-o`  | Output file (AGENTS.md, CLAUDE.md, etc.)       | `AGENTS.md`    |
| `--docs-dir`    | `-d`  | Directory to store downloaded docs             | `.docs`        |
| `--path`        | `-p`  | Subdirectory in repo to download (GitHub only) | Auto-detected  |
| `--source-name` | `-n`  | Custom name for the documentation source       | Auto-generated |
| `--branch`      | `-b`  | Git branch to download from (GitHub only)      | Auto-detected  |

### List Indexed Sources

```bash
agent-md-tool list
agent-md-tool list --output CLAUDE.md
```

### Remove a Source

```bash
agent-md-tool remove <source-name>
agent-md-tool remove next-js-docs --output CLAUDE.md
```

## Features

### Smart Project Inference

When creating a new AGENTS.md file, the tool automatically reads your `package.json` to:

- **Infer project description** - Uses the `description` field
- **Detect setup commands** - Finds `dev`, `build`, `test`, `lint` scripts
- **Detect package manager** - npm, yarn, pnpm, or bun based on lock files

### Auto Documentation Detection

For GitHub repositories, if you don't specify a path, the tool automatically looks for common documentation folders:

- `docs/`
- `doc/`
- `documentation/`
- `guide/`
- `guides/`

### Auto .gitignore

After downloading, the tool automatically adds the documentation directory (e.g., `.docs/`) to your `.gitignore` file to keep your repo clean.

### Compressed Index Format

The tool creates a token-efficient index format:

```markdown
<!-- DOCS-INDEX-START:next-js-docs -->

[Next Js Docs]
root: ./.docs/next-js-docs

IMPORTANT: Use retrieval-led reasoning. When you need Next Js Docs information, read files from the root directory above.

next-js-docs:{getting-started.md,routing.md}
next-js-docs/api:{endpoints.md,handlers.md}

<!-- DOCS-INDEX-END:next-js-docs -->
```

## Error Handling

The tool provides helpful error messages:

```
✖ No markdown files found in owner/repo

  The tool looks for files with extensions: .md, .mdx, .markdown

  Suggestions:
    • Check that the repository contains markdown documentation
    • Try specifying a path with --path (e.g., --path api-docs)
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run cli -- https://github.com/owner/repo

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## License

MIT
