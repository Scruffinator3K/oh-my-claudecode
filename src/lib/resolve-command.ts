/**
 * Command Resolution for Windows
 *
 * On Windows, npm-installed CLI tools are .cmd shim files that require
 * shell interpretation to execute. This module resolves bare command names
 * (e.g., 'codex') to their full paths (e.g., 'C:\\...\\codex.cmd') so
 * that spawn() can be used without shell:true.
 *
 * On non-Windows platforms, commands are returned unchanged.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { isAbsolute } from 'path';

/** Cache resolved paths to avoid repeated `where` calls */
const resolvedCache = new Map<string, string>();

/**
 * Resolve a bare command name to its full executable path on Windows.
 * On non-Windows platforms, returns the command unchanged.
 *
 * @param cmd - The command name (e.g., 'codex', 'gemini', 'node')
 * @returns The resolved full path on Windows, or the original command elsewhere
 */
export function resolveCommand(cmd: string): string {
  if (process.platform !== 'win32') {
    return cmd;
  }

  // Already a full path
  if (isAbsolute(cmd)) {
    return cmd;
  }

  // Check cache
  const cached = resolvedCache.get(cmd);
  if (cached) {
    return cached;
  }

  // Try 'where' (Windows equivalent of 'which')
  try {
    const result = execFileSync('where', [cmd], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // 'where' may return multiple lines; take the first match
    const resolved = result.trim().split(/\r?\n/)[0];
    if (resolved && existsSync(resolved)) {
      resolvedCache.set(cmd, resolved);
      return resolved;
    }
  } catch {
    // 'where' failed -- command not found or not on PATH
  }

  // If resolution fails, return original (spawn will fail with a clear error)
  return cmd;
}

/**
 * Clear the resolved command cache.
 * Useful for testing.
 */
export function clearResolvedCache(): void {
  resolvedCache.clear();
}
