/**
 * Safe RegExp Utilities
 *
 * Wraps RegExp construction with ReDoS (Regular Expression Denial of Service)
 * validation using the safe-regex library. Provides safe alternatives for
 * common patterns like glob-to-regex conversion.
 *
 * Usage:
 *   import { createSafeRegExp, escapeRegExp, globToSafeRegExp } from '../lib/safe-regexp.js';
 *
 *   const re = createSafeRegExp(userPattern, 'i');
 *   if (!re) { /* pattern is unsafe or invalid *\/ }
 */

import safeRegex from 'safe-regex';

/**
 * Escape all regex metacharacters in a string so it can be used
 * as a literal match inside a RegExp constructor.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for use in new RegExp()
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a RegExp after validating the pattern is not vulnerable to ReDoS.
 * Returns null if the pattern is invalid syntax or flagged as unsafe.
 *
 * @param pattern - The regex pattern string
 * @param flags - Optional regex flags (e.g., 'gi')
 * @returns A RegExp instance if safe, or null if unsafe/invalid
 */
export function createSafeRegExp(
  pattern: string,
  flags?: string,
): RegExp | null {
  try {
    const re = new RegExp(pattern, flags);
    if (!safeRegex(pattern)) {
      return null;
    }
    return re;
  } catch {
    return null;
  }
}

/**
 * Convert a glob pattern to a safe RegExp.
 * Escapes all metacharacters except `*` (→ `.*`) and `?` (→ `.`).
 * The resulting pattern is anchored with ^ and $.
 *
 * @param pattern - A glob pattern (e.g., "*.ts", "src/**\/*.js")
 * @param flags - Optional regex flags
 * @returns A RegExp instance if safe, or null if unsafe/invalid
 */
export function globToSafeRegExp(
  pattern: string,
  flags?: string,
): RegExp | null {
  const regexStr =
    '^' +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000GLOBSTAR\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000GLOBSTAR\u0000/g, '.*')
      .replace(/\?/g, '.') +
    '$';
  return createSafeRegExp(regexStr, flags);
}
