import { describe, expect, it } from 'vitest';

import {
  getInvalidEngineError,
  getMaxUriHandlersHint,
  getMissingIndexError,
  getSizeBudgetExceededError,
  getSourcepathNotFoundError
} from '../../src/errorMessages';

describe('errorMessages', () => {
  describe('getMissingIndexError', () => {
    it('should include error title', () => {
      const result = getMissingIndexError('psychic');
      expect(result).toContain('[ERROR]');
      expect(result).toContain('No index.html or index.htm found');
    });

    it('should include why this matters section', () => {
      const result = getMissingIndexError('psychic');
      expect(result).toContain('Why this matters:');
      expect(result).toContain('default entry point');
      expect(result).toContain('404 error');
    });

    it('should include engine-specific hint for psychic', () => {
      const result = getMissingIndexError('psychic');
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('server->defaultEndpoint');
    });

    it('should include engine-specific hint for psychic2', () => {
      const result = getMissingIndexError('psychic2');
      expect(result).toContain('PsychicHttpServer V2');
      expect(result).toContain('server->defaultEndpoint');
    });

    it('should include engine-specific hint for async', () => {
      const result = getMissingIndexError('async');
      expect(result).toContain('ESPAsyncWebServer');
      expect(result).toContain('server.on');
    });

    it('should include engine-specific hint for espidf', () => {
      const result = getMissingIndexError('espidf');
      expect(result).toContain('ESP-IDF');
      expect(result).toContain('httpd_register_uri_handler');
    });

    it('should include alternative solution', () => {
      const result = getMissingIndexError('psychic');
      expect(result).toContain('Alternative:');
      expect(result).toContain('--noindexcheck');
    });

    it('should fallback to psychic hint for unknown engine', () => {
      const result = getMissingIndexError('unknown' as 'psychic');
      expect(result).toContain('server->defaultEndpoint');
    });
  });

  describe('getInvalidEngineError', () => {
    it('should show attempted value', () => {
      const result = getInvalidEngineError('invalid');
      expect(result).toContain('[ERROR]');
      expect(result).toContain("'invalid'");
    });

    it('should list all valid engines', () => {
      const result = getInvalidEngineError('foo');
      expect(result).toContain('psychic');
      expect(result).toContain('psychic2');
      expect(result).toContain('async');
      expect(result).toContain('espidf');
    });

    it('should include engine descriptions', () => {
      const result = getInvalidEngineError('foo');
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('ESPAsyncWebServer');
      expect(result).toContain('ESP-IDF');
      expect(result).toContain('fastest performance');
      expect(result).toContain('ESP32/ESP8266 compatible');
    });

    it('should include example command', () => {
      const result = getInvalidEngineError('foo');
      expect(result).toContain('npx svelteesp32');
      expect(result).toContain('--engine=');
      expect(result).toContain('--sourcepath=');
    });

    it('should include RC file example', () => {
      const result = getInvalidEngineError('foo');
      expect(result).toContain('.svelteesp32rc.json');
      expect(result).toContain('"engine"');
      expect(result).toContain('"sourcepath"');
    });

    it('should include documentation link', () => {
      const result = getInvalidEngineError('foo');
      expect(result).toContain('Documentation:');
      expect(result).toContain('github.com');
    });
  });

  describe('getSourcepathNotFoundError', () => {
    describe('not_found variant', () => {
      it('should show error with path', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('[ERROR]');
        expect(result).toContain('./dist');
        expect(result).toContain('not found');
      });

      it('should include why this matters section', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('Why this matters:');
        expect(result).toContain('compiled web assets');
        expect(result).toContain('C++ header files');
      });

      it('should include build commands for all frameworks', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('Svelte:');
        expect(result).toContain('React:');
        expect(result).toContain('Vue:');
        expect(result).toContain('Angular:');
        expect(result).toContain('npm run build');
        expect(result).toContain('ng build');
      });

      it('should include build tool configuration hints', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('Vite:');
        expect(result).toContain('Webpack:');
        expect(result).toContain('Rollup:');
        expect(result).toContain('vite.config.js');
        expect(result).toContain('webpack.config.js');
        expect(result).toContain('rollup.config.js');
      });

      it('should include current and resolved paths', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('Current directory:');
        expect(result).toContain('Attempted path:');
        expect(result).toContain('(resolved)');
      });

      it('should include ls command suggestion', () => {
        const result = getSourcepathNotFoundError('./dist', 'not_found');
        expect(result).toContain('ls -la');
      });
    });

    describe('not_directory variant', () => {
      it('should show simpler error message', () => {
        const result = getSourcepathNotFoundError('./dist/index.html', 'not_directory');
        expect(result).toContain('[ERROR]');
        expect(result).toContain('./dist/index.html');
        expect(result).toContain('not a directory');
      });

      it('should explain sourcepath must be a directory', () => {
        const result = getSourcepathNotFoundError('./dist/index.html', 'not_directory');
        expect(result).toContain('must point to a directory');
        expect(result).toContain('not an individual file');
      });

      it('should include example fix', () => {
        const result = getSourcepathNotFoundError('./dist/index.html', 'not_directory');
        expect(result).toContain('npx svelteesp32');
        expect(result).toContain('--sourcepath=./dist');
      });
    });
  });

  describe('getSizeBudgetExceededError', () => {
    it('should show error for uncompressed size type', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('[ERROR]');
      expect(result).toContain('Uncompressed size budget exceeded');
    });

    it('should show error for gzip size type', () => {
      const result = getSizeBudgetExceededError('gzipSize', 50_000, 75_000);
      expect(result).toContain('[ERROR]');
      expect(result).toContain('Gzip size budget exceeded');
    });

    it('should display budget and actual values', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('Budget:');
      expect(result).toContain('100,000 bytes');
      expect(result).toContain('Actual:');
      expect(result).toContain('150,000 bytes');
    });

    it('should calculate and display overage', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('Overage:');
      expect(result).toContain('50,000 bytes');
      expect(result).toContain('+50%');
    });

    it('should include correct flag name for size type', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('--maxsize=150000');
    });

    it('should include correct flag name for gzipSize type', () => {
      const result = getSizeBudgetExceededError('gzipSize', 50_000, 75_000);
      expect(result).toContain('--maxgzipsize=75000');
    });

    it('should include why this matters section', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('Why this matters:');
      expect(result).toContain('frontend bloat');
      expect(result).toContain('flash memory');
    });

    it('should include how to fix suggestions', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('How to fix:');
      expect(result).toContain('tree-shaking');
      expect(result).toContain('--exclude patterns');
    });

    it('should include CI integration note', () => {
      const result = getSizeBudgetExceededError('size', 100_000, 150_000);
      expect(result).toContain('CI integration:');
      expect(result).toContain('non-zero exit code');
      expect(result).toContain('build pipelines');
    });
  });

  describe('getMaxUriHandlersHint', () => {
    it('should calculate recommended handler count', () => {
      const result = getMaxUriHandlersHint('psychic', 10);
      expect(result).toContain('15'); // 10 + 5
      expect(result).toContain('at least 10');
    });

    it('should include route count in message', () => {
      const result = getMaxUriHandlersHint('psychic', 10);
      expect(result).toContain('10 routes');
    });

    it('should show engine-specific code for psychic', () => {
      const result = getMaxUriHandlersHint('psychic', 10);
      expect(result).toContain('[CONFIG TIP]');
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('server.config.max_uri_handlers');
      expect(result).toContain('initSvelteStaticFiles');
      expect(result).toContain('server.listen(80)');
    });

    it('should show engine-specific code for psychic2', () => {
      const result = getMaxUriHandlersHint('psychic2', 12);
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('server.config.max_uri_handlers = 17');
      expect(result).toContain('at least 12');
    });

    it('should show engine-specific code for espidf', () => {
      const result = getMaxUriHandlersHint('espidf', 8);
      expect(result).toContain('ESP-IDF');
      expect(result).toContain('HTTPD_DEFAULT_CONFIG');
      expect(result).toContain('config.max_uri_handlers = 13');
      expect(result).toContain('httpd_start');
    });

    it('should return empty string for async engine', () => {
      const result = getMaxUriHandlersHint('async', 10);
      expect(result).toBe('');
    });

    it('should return empty string for unknown engine', () => {
      const result = getMaxUriHandlersHint('unknown' as 'psychic', 10);
      expect(result).toBe('');
    });

    it('should include recommended formula', () => {
      const result = getMaxUriHandlersHint('psychic', 10);
      expect(result).toContain('Recommended formula');
      expect(result).toContain('file_count + 5');
      expect(result).toContain('safety margin');
    });

    it('should include runtime symptoms', () => {
      const result = getMaxUriHandlersHint('psychic', 10);
      expect(result).toContain('Runtime symptoms');
      expect(result).toContain('HTTP 404');
      expect(result).toContain('ESP_ERR_HTTPD_HANDLERS_FULL');
      expect(result).toContain('random behavior');
    });
  });
});
