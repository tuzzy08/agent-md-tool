/**
 * Gitignore module - manages .gitignore entries for downloaded documentation
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Ensure a directory is added to .gitignore
 */
export async function addToGitignore(docsDir: string): Promise<boolean> {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const entry = docsDir.replace(/\\/g, '/');
  
  // Normalize the entry (remove leading ./ if present, ensure no trailing slash)
  const normalizedEntry = entry.replace(/^\.\//, '').replace(/\/$/, '');
  const gitignoreEntry = normalizedEntry + '/';
  
  try {
    // Check if .gitignore exists
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, we'll create it
    }
    
    // Check if entry already exists
    const lines = content.split('\n');
    const alreadyExists = lines.some(line => {
      const trimmedLine = line.trim();
      return trimmedLine === normalizedEntry || 
             trimmedLine === gitignoreEntry ||
             trimmedLine === '/' + normalizedEntry ||
             trimmedLine === '/' + gitignoreEntry;
    });
    
    if (alreadyExists) {
      return false; // Already in gitignore
    }
    
    // Add the entry
    const newContent = content.trimEnd() + (content.length > 0 ? '\n\n' : '') +
      `# Downloaded documentation (agent-md-tool)\n${gitignoreEntry}\n`;
    
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
    return true;
    
  } catch (error: any) {
    // Don't fail the whole operation if we can't update .gitignore
    console.warn(`⚠️  Could not update .gitignore: ${error.message}`);
    return false;
  }
}

/**
 * Check if a directory is already in .gitignore
 */
export async function isInGitignore(docsDir: string): Promise<boolean> {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const normalizedEntry = docsDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    
    return lines.some(line => {
      const trimmedLine = line.trim();
      return trimmedLine === normalizedEntry || 
             trimmedLine === normalizedEntry + '/' ||
             trimmedLine === '/' + normalizedEntry ||
             trimmedLine === '/' + normalizedEntry + '/';
    });
  } catch {
    return false;
  }
}
