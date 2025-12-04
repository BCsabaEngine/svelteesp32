# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.12.0] - 2025-12-04

### Added

- **Configuration File Support**: New RC file feature (`.svelteesp32rc.json`) for storing frequently-used options
  - Automatic search in current directory and user home directory
  - `--config` flag for specifying custom RC file path
  - All CLI options can be configured in RC file using long-form property names
  - CLI arguments always override RC file values (3-stage merge: defaults → RC → CLI)
  - **Replace mode** for exclude patterns: RC or CLI exclude completely replaces defaults
  - Cyan-colored console output showing which RC file was loaded
  - Comprehensive validation with unknown property warnings to catch typos
  - Example RC file (`.svelteesp32rc.example.json`) included in repository
- 16 new unit tests for RC file functionality:
  - RC file discovery (current directory, home directory, custom path)
  - RC file parsing and validation (invalid JSON, invalid values, unknown properties)
  - CLI override behavior
  - Exclude pattern replace mode
  - Backward compatibility
- Updated test coverage to 84.32% for `commandLine.ts` (up from 84.56%)
- TypeScript type safety improvements: replaced `any` with `unknown` in `validateRcConfig()`

### Changed

- Enhanced `commandLine.ts` with RC file loading, validation, and merging logic
- Updated help text with RC file documentation and examples
- Enhanced README.md with comprehensive "Configuration File" section:
  - Quick start guide with example RC file
  - Configuration reference table mapping RC properties to CLI flags
  - CLI override examples
  - Multiple environment setup guide (dev/prod configs)
  - Exclude pattern behavior documentation
- Updated command line options table with `--config` flag
- Error message for missing `--sourcepath` now mentions RC file option
- All 92 tests passing with new RC file test suite

### Fixed

- ESLint error: replaced `any` type with `unknown` in configuration validation

## [1.11.0] - 2025-12-03

### Added

- **File Exclusion Feature**: New `--exclude` flag for filtering files using glob patterns
  - Support for simple wildcards (`*.map`, `*.txt`) and directory patterns (`test/**/*.js`)
  - Multiple pattern formats: repeated flags (`--exclude *.map --exclude *.md`) and comma-separated (`--exclude="*.map,*.md"`)
  - Default exclusions for common system and development files (`.DS_Store`, `Thumbs.db`, `.git`, `.svn`, `*.swp`, `*~`, `.gitignore`, `.gitattributes`)
  - Cyan-colored console output showing excluded file count and list
  - Cross-platform path normalization for Windows compatibility
  - Uses `picomatch` library (transitive dependency via `tinyglobby`) for pattern matching
- Unit testing infrastructure using Vitest
- Comprehensive test coverage (~72%) for core modules:
  - `commandLine.ts` (~90%): CLI argument parsing and validation including exclude patterns
  - `file.ts` (100%): File operations, duplicate detection, and exclusion filtering
  - `cppCode.ts` (96.62%): C++ code generation and templates
  - `consoleColor.ts` (100%): Console utilities including new `cyanLog` function
- 15 new unit tests for file exclusion feature (8 for CLI parsing, 7 for exclusion logic)
- Test fixtures for validating file processing
- Coverage reports with HTML output
- `cyanLog()` color function for exclusion output messages

### Changed

- Updated file collection pipeline to filter excluded files after pre-compressed detection
- Enhanced `commandLine.ts` with exclude pattern parsing for three argument formats
- Enhanced `file.ts` with `isExcluded()` function and exclusion reporting
- Updated `.gitignore` to exclude `coverage/` directory
- Enhanced documentation with testing sections and comprehensive file exclusion guide
- Updated README.md with file exclusion section including usage examples, pattern syntax, and default exclusions
- Updated CLAUDE.md with technical file exclusion implementation details and example output

## [1.10.0] - 2025-11-20

### Changed

- Replaced `ts-command-line-args` dependency with native Node.js argument parser
- Reduced package dependencies from 4 to 3 runtime dependencies
- Improved CLI argument parsing with custom implementation using `process.argv`

## [1.9.4] - 2025-11-18

### Changed

- Solve CVE-2025-64756 glob vulnerability

## [1.9.3] - 2025-11-01

### Added

- ETag validation support for ESP-IDF engine (`httpd_req_get_hdr_value_len` and `httpd_req_get_hdr_value_str`)
- HTTP 304 Not Modified response handling for ESP-IDF engine, matching behavior of other engines

### Changed

- Optimized generated C++ code for ESPAsyncWebServer engine:
  - Optimized If-None-Match header lookups (single call instead of `hasHeader()` + `getHeader()`)
  - Removed unnecessary `String()` temporary objects in ETag comparisons (use `.equals()` directly)
- Optimized generated C++ code for PsychicHttpServer engines (psychic, psychic2):
  - Removed unnecessary `String()` temporary objects in ETag comparisons (use `.equals()` directly)

## [1.9.2] - 2025-10-18

### Changed

- Improved CLAUDE.md with detailed architecture information, processing pipeline details, and template system documentation
- Enhanced README.md with comprehensive updates:
  - Added Node.js >= 20 and npm >= 9 requirements
  - Added ESP-IDF native code usage example
  - Improved generated code examples with complete header structure
  - Enhanced engine descriptions with detailed use cases
  - Added PsychicHttpServer `max_uri_handlers` configuration note
  - Improved compression output examples with percentage ratios
  - Better Q&A explanations for PROGMEM usage and file size
  - Updated command line options table with clarifications
  - Fixed inaccuracies in MIME type package references
- Reformatted CHANGELOG.md to follow Keep a Changelog standard with proper categorization and GitHub comparison links

## [1.9.1] - 2024-09-13

### Changed

- Updated dependencies
- **BREAKING**: Require Node.js >= 20 and npm >= 9

## [1.9.0] - 2024-03-31

### Added

- Code generator support for native ESP-IDF web server (`-e espidf`)
- New `src/cppCodeEspIdf.ts` module for ESP-IDF template generation
- ESP-IDF demo project in `demo/esp32idf/`

## [1.8.1] - 2023-12-XX

### Fixed

- HTTP header casing issues

## [1.8.0] - 2023-XX-XX

### Changed

- Updated to use the new and maintained ESPAsyncWebServer from https://github.com/ESP32Async/ESPAsyncWebServer
- Adapted to ESPAsyncWebServer API deprecations

## [1.7.1] - 2023-XX-XX

### Fixed

- Reverted to **mime-types** npm package due to ESM compatibility issues

## [1.7.0] - 2023-XX-XX

### Added

- `--cachetime` command line option to control browser caching behavior
- Ability to set `max-age` cache control header value (in seconds)
- Works in conjunction with ETag to replace default `no-cache` response

## [1.6.1] - 2023-XX-XX

### Changed

- Force publish to npm registry

## [1.6.0] - 2023-XX-XX

### Changed

- Switched to `mime-types` package for better MIME type handling
- Updated MIME type for JavaScript files to standard `text/javascript` (was `application/javascript`)

## [1.5.2] - 2023-XX-XX

### Changed

- Added comment in PsychicHttpServer generated code suggesting minimum `server.config.max_uri_handlers` setting (default 20) to ensure all files can be served

## [1.5.1] - 2023-XX-XX

### Fixed

- Fixed error when file names contain `@` character
- Enhanced character protection for file name conversion to C++ identifiers: `!&()+./@{}~-`

## [1.5.0] - 2023-XX-XX

### Added

- New engine type `-e psychic2` for PsychicHttpServer V2 support
- PsychicHttpServer V2 template with updated API (response passed as parameter)

### Changed

- Test suite now uses GitHub repositories instead of npm packages

## [1.4.1] - 2023-XX-XX

### Added

- Duplicate file detection using SHA256 hashing
- Logging of files with identical content
- Support for multiple linting tools (ESLint with TypeScript, Prettier, Unicorn plugins)

## [1.4.0] - 2023-XX-XX

### Added

- Three-state option support for `--etag` and `--gzip` parameters: `true|false|compiler`
  - `compiler` mode generates both variants in .h file with C++ preprocessor directives
  - Allows runtime configuration via `SVELTEESP32_ENABLE_ETAG` and `SVELTEESP32_ENABLE_GZIP` defines
- `--created` option to include creation timestamp in generated header
- `--version` option to include version string in generated header
- Comprehensive test system generating all parameter combinations (2×9 builds)
- Automatic output directory creation if it doesn't exist
- Pre-compressed file detection (skips `.gz`, `.br`, `.brottli` if original exists)
- Colored console output for better readability
- Warning messages when non-effective directives are used

### Changed

- **BREAKING**: Renamed `--no-gzip` to `--gzip` (inverted logic)
- Increased gzip threshold from default to 1024 bytes minimum
- Reduced generated .h file size by 35-50% through optimizations
- Separated demo environment
- Improved Svelte demo application
- Updated pipeline Node.js version

## [1.3.1] - 2023-XX-XX

### Changed

- Filename C++ defines are now uppercased (e.g., `SVELTEESP32_FILE_INDEX_HTML`)

### Added

- File count statistics grouped by extension (e.g., `SVELTEESP32_CSS_FILES`)

## [1.3.0] - 2023-XX-XX

### Added

- C++ preprocessor defines for build-time validation:
  - `{PREFIX}_COUNT` - Total file count
  - `{PREFIX}_SIZE` - Total uncompressed size
  - `{PREFIX}_SIZE_GZIP` - Total gzip compressed size
  - `{PREFIX}_FILE_{FILENAME}` - Individual file markers
  - `{PREFIX}_{EXT}_FILES` - Count by file extension
- Ability to use `#ifndef` and `#error` for compile-time checks

## [1.2.4] - 2023-XX-XX

### Changed

- Updated dependencies

## [1.2.2] - 2023-XX-XX

### Added

- Necessary C++ includes in generated headers

## [1.2.1] - 2023-XX-XX

### Fixed

- Windows path handling

## [1.2.0] - 2023-XX-XX

### Added

- ESP8266/ESP8285 support
- PROGMEM directive usage for ESPAsyncWebServer engine

## [1.1.0] - 2023-XX-XX

### Added

- ETag HTTP header support for cache validation
- MD5 hash generation for ETag values
- HTTP 304 Not Modified response handling
- `--etag` command line option

## [1.0.0] - 2023-XX-XX

### Added

- Initial release
- Support for PsychicHttpServer (ESP32)
- Support for ESPAsyncWebServer (ESP32/ESP8266)
- Automatic gzip compression for files >1024 bytes with >15% size reduction
- Binary data embedding as const arrays
- MIME type detection
- Handlebars-based C++ code generation
- CLI interface with `-s`, `-e`, `-o` options
- `index.html` automatic default route handling

[1.12.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.9.4...v1.10.0
[1.9.4]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.9.3...v1.9.4
[1.9.3]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.2.4...v1.3.0
[1.2.4]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.2.2...v1.2.4
[1.2.2]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/BCsabaEngine/svelteesp32/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/BCsabaEngine/svelteesp32/releases/tag/v1.0.0
