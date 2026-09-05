import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('consoleColor', () => {
  const originalNoColor = process.env['NO_COLOR'];
  const originalForceColor = process.env['FORCE_COLOR'];
  const originalIsTty = process.stdout.isTTY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env['NO_COLOR'];
    delete process.env['FORCE_COLOR'];
    process.stdout.isTTY = false;
  });

  afterEach(() => {
    if (originalNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = originalNoColor;

    if (originalForceColor === undefined) delete process.env['FORCE_COLOR'];
    else process.env['FORCE_COLOR'] = originalForceColor;

    process.stdout.isTTY = originalIsTty;
  });

  describe('when colors are enabled (FORCE_COLOR set)', () => {
    beforeEach(() => {
      process.env['FORCE_COLOR'] = '1';
    });

    describe('greenLog', () => {
      it('should wrap text with green ANSI codes', async () => {
        const { greenLog } = await import('../../src/consoleColor');
        expect(greenLog('success')).toBe('\u{1B}[32msuccess\u{1B}[0m');
      });

      it('should handle empty strings', async () => {
        const { greenLog } = await import('../../src/consoleColor');
        expect(greenLog('')).toBe('\u{1B}[32m\u{1B}[0m');
      });

      it('should handle strings with special characters', async () => {
        const { greenLog } = await import('../../src/consoleColor');
        expect(greenLog('Hello\nWorld!')).toBe('\u{1B}[32mHello\nWorld!\u{1B}[0m');
      });
    });

    describe('yellowLog', () => {
      it('should wrap text with yellow ANSI codes', async () => {
        const { yellowLog } = await import('../../src/consoleColor');
        expect(yellowLog('warning')).toBe('\u{1B}[33mwarning\u{1B}[0m');
      });

      it('should handle empty strings', async () => {
        const { yellowLog } = await import('../../src/consoleColor');
        expect(yellowLog('')).toBe('\u{1B}[33m\u{1B}[0m');
      });

      it('should handle strings with special characters', async () => {
        const { yellowLog } = await import('../../src/consoleColor');
        expect(yellowLog('Test@123')).toBe('\u{1B}[33mTest@123\u{1B}[0m');
      });
    });

    describe('redLog', () => {
      it('should wrap text with red ANSI codes', async () => {
        const { redLog } = await import('../../src/consoleColor');
        expect(redLog('error')).toBe('\u{1B}[31merror\u{1B}[0m');
      });

      it('should handle empty strings', async () => {
        const { redLog } = await import('../../src/consoleColor');
        expect(redLog('')).toBe('\u{1B}[31m\u{1B}[0m');
      });

      it('should handle strings with numbers', async () => {
        const { redLog } = await import('../../src/consoleColor');
        expect(redLog('Error 404')).toBe('\u{1B}[31mError 404\u{1B}[0m');
      });
    });

    describe('cyanLog', () => {
      it('should wrap text with cyan ANSI codes', async () => {
        const { cyanLog } = await import('../../src/consoleColor');
        expect(cyanLog('info')).toBe('\u{1B}[36minfo\u{1B}[0m');
      });

      it('should handle empty strings', async () => {
        const { cyanLog } = await import('../../src/consoleColor');
        expect(cyanLog('')).toBe('\u{1B}[36m\u{1B}[0m');
      });

      it('should handle strings with special characters', async () => {
        const { cyanLog } = await import('../../src/consoleColor');
        expect(cyanLog('Path: /foo/bar')).toBe('\u{1B}[36mPath: /foo/bar\u{1B}[0m');
      });
    });

    describe('all color functions', () => {
      it('should produce different color codes for each function', async () => {
        const { cyanLog, greenLog, redLog, yellowLog } = await import('../../src/consoleColor');
        const green = greenLog('test');
        const yellow = yellowLog('test');
        const red = redLog('test');
        const cyan = cyanLog('test');

        expect(green).not.toBe(yellow);
        expect(yellow).not.toBe(red);
        expect(red).not.toBe(green);
        expect(cyan).not.toBe(green);
        expect(cyan).not.toBe(yellow);
        expect(cyan).not.toBe(red);
      });

      it('should all end with reset code', async () => {
        const { cyanLog, greenLog, redLog, yellowLog } = await import('../../src/consoleColor');
        expect(greenLog('test')).toContain('\u{1B}[0m');
        expect(yellowLog('test')).toContain('\u{1B}[0m');
        expect(redLog('test')).toContain('\u{1B}[0m');
        expect(cyanLog('test')).toContain('\u{1B}[0m');
      });
    });
  });

  describe('color enablement rules', () => {
    it('returns plain text when neither FORCE_COLOR nor a TTY is present', async () => {
      process.stdout.isTTY = false;
      const { greenLog } = await import('../../src/consoleColor');
      expect(greenLog('plain')).toBe('plain');
    });

    it('applies color when attached to a TTY', async () => {
      process.stdout.isTTY = true;
      const { greenLog } = await import('../../src/consoleColor');
      expect(greenLog('tty')).toBe('\u{1B}[32mtty\u{1B}[0m');
    });

    it('applies color when FORCE_COLOR is set even without a TTY', async () => {
      process.stdout.isTTY = false;
      process.env['FORCE_COLOR'] = '1';
      const { greenLog } = await import('../../src/consoleColor');
      expect(greenLog('forced')).toBe('\u{1B}[32mforced\u{1B}[0m');
    });

    it('suppresses color when NO_COLOR is set, even with FORCE_COLOR and a TTY', async () => {
      process.stdout.isTTY = true;
      process.env['FORCE_COLOR'] = '1';
      process.env['NO_COLOR'] = '1';
      const { greenLog } = await import('../../src/consoleColor');
      expect(greenLog('quiet')).toBe('quiet');
    });

    it('suppresses color when NO_COLOR is set with a TTY present', async () => {
      process.stdout.isTTY = true;
      process.env['NO_COLOR'] = '1';
      const { greenLog } = await import('../../src/consoleColor');
      expect(greenLog('quiet')).toBe('quiet');
    });
  });
});
