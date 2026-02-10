import { describe, it, expect } from 'vitest';
import { escapeRegExp, createSafeRegExp, globToSafeRegExp } from '../safe-regexp.js';

describe('escapeRegExp', () => {
  it('escapes all regex metacharacters', () => {
    const input = '.*+?^${}()|[]\\';
    const escaped = escapeRegExp(input);
    // Every metacharacter should be preceded by a backslash
    expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('abc123')).toBe('abc123');
  });

  it('escapes dots in filenames', () => {
    const escaped = escapeRegExp('tsconfig.json');
    expect(escaped).toBe('tsconfig\\.json');
    expect(new RegExp(escaped).test('tsconfig.json')).toBe(true);
    expect(new RegExp(escaped).test('tsconfigXjson')).toBe(false);
  });

  it('handles empty string', () => {
    expect(escapeRegExp('')).toBe('');
  });
});

describe('createSafeRegExp', () => {
  it('returns a valid RegExp for safe patterns', () => {
    const re = createSafeRegExp('\\bfoo\\b', 'i');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('foo')).toBe(true);
    expect(re!.test('foobar')).toBe(false);
  });

  it('returns null for ReDoS-vulnerable patterns', () => {
    // Classic ReDoS: catastrophic backtracking with nested quantifiers
    expect(createSafeRegExp('(a+)+b')).toBeNull();
    expect(createSafeRegExp('([a-zA-Z]+)*')).toBeNull();
  });

  it('returns null for invalid regex syntax', () => {
    expect(createSafeRegExp('[')).toBeNull();
    expect(createSafeRegExp('(?P<invalid')).toBeNull();
  });

  it('preserves flags', () => {
    const re = createSafeRegExp('hello', 'gi');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.flags).toContain('g');
    expect(re!.flags).toContain('i');
  });

  it('accepts simple safe patterns', () => {
    expect(createSafeRegExp('^test$')).toBeInstanceOf(RegExp);
    expect(createSafeRegExp('[a-z]+')).toBeInstanceOf(RegExp);
    expect(createSafeRegExp('\\d{3}-\\d{4}')).toBeInstanceOf(RegExp);
  });
});

describe('globToSafeRegExp', () => {
  it('converts simple wildcard globs', () => {
    const re = globToSafeRegExp('*.ts');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('foo.ts')).toBe(true);
    expect(re!.test('bar.ts')).toBe(true);
    expect(re!.test('foo.js')).toBe(false);
  });

  it('converts globs with dots correctly', () => {
    const re = globToSafeRegExp('tsconfig.*.json');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('tsconfig.build.json')).toBe(true);
    expect(re!.test('tsconfig.json')).toBe(false);
  });

  it('handles ** globstar patterns', () => {
    const re = globToSafeRegExp('src/**/*.ts');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('src/foo/bar.ts')).toBe(true);
    expect(re!.test('src/deep/nested/file.ts')).toBe(true);
    expect(re!.test('src/foo.js')).toBe(false);
  });

  it('anchors patterns with ^ and $', () => {
    const re = globToSafeRegExp('test');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('test')).toBe(true);
    expect(re!.test('testing')).toBe(false);
    expect(re!.test('a test')).toBe(false);
  });

  it('handles ? single-character wildcard', () => {
    const re = globToSafeRegExp('file?.txt');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('file1.txt')).toBe(true);
    expect(re!.test('fileA.txt')).toBe(true);
    expect(re!.test('file.txt')).toBe(false);
    expect(re!.test('file12.txt')).toBe(false);
  });

  it('escapes regex metacharacters in the pattern', () => {
    const re = globToSafeRegExp('file(1).txt');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('file(1).txt')).toBe(true);
    expect(re!.test('file1.txt')).toBe(false);
  });

  it('supports flags', () => {
    const re = globToSafeRegExp('*.TXT', 'i');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('readme.txt')).toBe(true);
    expect(re!.test('README.TXT')).toBe(true);
  });
});
