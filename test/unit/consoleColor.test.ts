import { describe, expect, it } from 'vitest';

import { greenLog, redLog, yellowLog } from '../../src/consoleColor';

describe('consoleColor', () => {
  describe('greenLog', () => {
    it('should wrap text with green ANSI codes', () => {
      const result = greenLog('success');
      expect(result).toBe('\u001B[32msuccess\u001B[0m');
    });

    it('should handle empty strings', () => {
      const result = greenLog('');
      expect(result).toBe('\u001B[32m\u001B[0m');
    });

    it('should handle strings with special characters', () => {
      const result = greenLog('Hello\nWorld!');
      expect(result).toBe('\u001B[32mHello\nWorld!\u001B[0m');
    });
  });

  describe('yellowLog', () => {
    it('should wrap text with yellow ANSI codes', () => {
      const result = yellowLog('warning');
      expect(result).toBe('\u001B[33mwarning\u001B[0m');
    });

    it('should handle empty strings', () => {
      const result = yellowLog('');
      expect(result).toBe('\u001B[33m\u001B[0m');
    });

    it('should handle strings with special characters', () => {
      const result = yellowLog('Test@123');
      expect(result).toBe('\u001B[33mTest@123\u001B[0m');
    });
  });

  describe('redLog', () => {
    it('should wrap text with red ANSI codes', () => {
      const result = redLog('error');
      expect(result).toBe('\u001B[31merror\u001B[0m');
    });

    it('should handle empty strings', () => {
      const result = redLog('');
      expect(result).toBe('\u001B[31m\u001B[0m');
    });

    it('should handle strings with numbers', () => {
      const result = redLog('Error 404');
      expect(result).toBe('\u001B[31mError 404\u001B[0m');
    });
  });

  describe('all color functions', () => {
    it('should produce different color codes for each function', () => {
      const green = greenLog('test');
      const yellow = yellowLog('test');
      const red = redLog('test');

      expect(green).not.toBe(yellow);
      expect(yellow).not.toBe(red);
      expect(red).not.toBe(green);
    });

    it('should all end with reset code', () => {
      expect(greenLog('test')).toContain('\u001B[0m');
      expect(yellowLog('test')).toContain('\u001B[0m');
      expect(redLog('test')).toContain('\u001B[0m');
    });
  });
});
