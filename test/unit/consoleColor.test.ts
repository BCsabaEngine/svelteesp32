import { describe, expect, it } from 'vitest';

import { cyanLog, greenLog, redLog, yellowLog } from '../../src/consoleColor';

describe('consoleColor', () => {
  describe('greenLog', () => {
    it('should wrap text with green ANSI codes', () => {
      const result = greenLog('success');
      expect(result).toBe('\u{1B}[32msuccess\u{1B}[0m');
    });

    it('should handle empty strings', () => {
      const result = greenLog('');
      expect(result).toBe('\u{1B}[32m\u{1B}[0m');
    });

    it('should handle strings with special characters', () => {
      const result = greenLog('Hello\nWorld!');
      expect(result).toBe('\u{1B}[32mHello\nWorld!\u{1B}[0m');
    });
  });

  describe('yellowLog', () => {
    it('should wrap text with yellow ANSI codes', () => {
      const result = yellowLog('warning');
      expect(result).toBe('\u{1B}[33mwarning\u{1B}[0m');
    });

    it('should handle empty strings', () => {
      const result = yellowLog('');
      expect(result).toBe('\u{1B}[33m\u{1B}[0m');
    });

    it('should handle strings with special characters', () => {
      const result = yellowLog('Test@123');
      expect(result).toBe('\u{1B}[33mTest@123\u{1B}[0m');
    });
  });

  describe('redLog', () => {
    it('should wrap text with red ANSI codes', () => {
      const result = redLog('error');
      expect(result).toBe('\u{1B}[31merror\u{1B}[0m');
    });

    it('should handle empty strings', () => {
      const result = redLog('');
      expect(result).toBe('\u{1B}[31m\u{1B}[0m');
    });

    it('should handle strings with numbers', () => {
      const result = redLog('Error 404');
      expect(result).toBe('\u{1B}[31mError 404\u{1B}[0m');
    });
  });

  describe('cyanLog', () => {
    it('should wrap text with cyan ANSI codes', () => {
      const result = cyanLog('info');
      expect(result).toBe('\u{1B}[36minfo\u{1B}[0m');
    });

    it('should handle empty strings', () => {
      const result = cyanLog('');
      expect(result).toBe('\u{1B}[36m\u{1B}[0m');
    });

    it('should handle strings with special characters', () => {
      const result = cyanLog('Path: /foo/bar');
      expect(result).toBe('\u{1B}[36mPath: /foo/bar\u{1B}[0m');
    });
  });

  describe('all color functions', () => {
    it('should produce different color codes for each function', () => {
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

    it('should all end with reset code', () => {
      expect(greenLog('test')).toContain('\u{1B}[0m');
      expect(yellowLog('test')).toContain('\u{1B}[0m');
      expect(redLog('test')).toContain('\u{1B}[0m');
      expect(cyanLog('test')).toContain('\u{1B}[0m');
    });
  });
});
