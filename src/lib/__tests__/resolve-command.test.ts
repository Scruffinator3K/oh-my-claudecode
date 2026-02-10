import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand, clearResolvedCache } from '../resolve-command.js';
import * as child_process from 'child_process';
import * as fs from 'fs';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

const mockedExecFileSync = vi.mocked(child_process.execFileSync);
const mockedExistsSync = vi.mocked(fs.existsSync);

const originalPlatform = process.platform;

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResolvedCache();
  mockedExistsSync.mockReturnValue(true);
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
});

describe('resolveCommand', () => {
  describe('non-Windows platforms', () => {
    it('returns command unchanged on Linux', () => {
      setPlatform('linux');
      expect(resolveCommand('codex')).toBe('codex');
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('returns command unchanged on macOS', () => {
      setPlatform('darwin');
      expect(resolveCommand('gemini')).toBe('gemini');
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Windows platform', () => {
    beforeEach(() => {
      setPlatform('win32');
    });

    it('resolves command via where.exe', () => {
      mockedExecFileSync.mockReturnValue('C:\\Users\\x\\AppData\\npm\\codex.cmd\r\n');
      const result = resolveCommand('codex');
      expect(result).toBe('C:\\Users\\x\\AppData\\npm\\codex.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'where',
        ['codex'],
        expect.objectContaining({ encoding: 'utf8', timeout: 5000 }),
      );
    });

    it('returns original command when where fails', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(resolveCommand('nonexistent')).toBe('nonexistent');
    });

    it('returns original command when resolved path does not exist', () => {
      mockedExecFileSync.mockReturnValue('C:\\phantom\\codex.cmd\r\n');
      mockedExistsSync.mockReturnValue(false);
      expect(resolveCommand('codex')).toBe('codex');
    });

    it('returns absolute paths unchanged', () => {
      const absPath = 'C:\\Program Files\\codex\\codex.exe';
      expect(resolveCommand(absPath)).toBe(absPath);
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('caches resolved paths', () => {
      mockedExecFileSync.mockReturnValue('C:\\Users\\x\\npm\\codex.cmd\r\n');
      resolveCommand('codex');
      resolveCommand('codex');
      // Only one call to where, second hit uses cache
      expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('takes first line when where returns multiple results', () => {
      mockedExecFileSync.mockReturnValue(
        'C:\\first\\codex.cmd\r\nC:\\second\\codex.cmd\r\n',
      );
      expect(resolveCommand('codex')).toBe('C:\\first\\codex.cmd');
    });
  });
});
