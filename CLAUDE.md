# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SvelteESP32 is a TypeScript CLI tool that converts frontend JS applications (Svelte, React, Angular, Vue) into C++ header files that can be embedded in ESP32/ESP8266 microcontroller web servers. The tool processes web assets and generates optimized C++ code with optional gzip compression and ETag support for different web server engines.

## Key Commands

### Development Commands

```bash
# Build the project
npm run build

# Clean build artifacts
npm run clean

# Development with live reload (async engine)
npm run dev:async

# Development with live reload (psychic engine)
npm run dev:psychic

# Development with live reload (psychic2 engine)
npm run dev:psychic2

# Run comprehensive tests (requires PlatformIO)
npm run test:all
```

### Code Quality Commands

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format:fix

# Check linting
npm run lint:check

# Fix linting issues
npm run lint:fix

# Fix all formatting and linting issues
npm run fix
```

### CLI Usage

```bash
# Generate header for PsychicHttpServer
npx svelteesp32 -e psychic -s ./dist -o ./output.h --etag=true --gzip=true

# Generate header for ESPAsyncWebServer
npx svelteesp32 -e async -s ./dist -o ./output.h --etag=true --gzip=true

# Generate header for ESP-IDF
npx svelteesp32 -e espidf -s ./dist -o ./output.h --etag=true --gzip=true
```

## Architecture

### Core Components

- **`src/index.ts`**: Main entry point that orchestrates the file processing pipeline
- **`src/commandLine.ts`**: CLI argument parsing and validation using `ts-command-line-args`
- **`src/file.ts`**: File system operations for reading web assets
- **`src/cppCode.ts`**: C++ code generation engine with Handlebars templates for PsychicHttp and ESPAsyncWebServer
- **`src/cppCodeEspIdf.ts`**: Specialized C++ code generation for native ESP-IDF
- **`src/consoleColor.ts`**: Colored console output utilities

### Processing Pipeline

1. **File Collection**: Scans source directory for web assets
2. **Content Analysis**: Determines MIME types and calculates MD5 hashes
3. **Compression**: Applies gzip compression when beneficial (>1024 bytes, >15% reduction)
4. **Code Generation**: Uses Handlebars templates to generate C++ header files
5. **Output**: Writes optimized header with embedded binary data and web server handlers

### Supported Engines

- **psychic**: PsychicHttpServer (ESP32 only, fastest performance)
- **psychic2**: PsychicHttpServer V2
- **async**: ESPAsyncWebServer (ESP32/ESP8266 compatible)
- **espidf**: Native ESP-IDF web server

### Key Features

- **Automatic Gzip Compression**: Compresses assets when size reduction >15% and >1024 bytes
- **ETag Support**: HTTP cache validation for reduced network traffic
- **Cache Control**: Configurable browser caching with `--cachetime`
- **Multi-Engine Support**: Generate code for different ESP web server libraries
- **File Type Analysis**: Groups files by extension with count statistics
- **Memory Optimization**: Binary data stored as const arrays in program memory

## Development Environment

### Build System

- **TypeScript**: Compiled to CommonJS in `dist/` directory
- **Target**: ES2020 with strict type checking
- **Incremental**: Disabled to ensure clean builds

### Code Quality

- **ESLint**: Comprehensive rules including TypeScript, Prettier, Unicorn plugins
- **Prettier**: 120 character line width, single quotes, no trailing commas
- **Import Sorting**: Automatic import organization with `simple-import-sort`

### Demo Projects

- **`demo/svelte/`**: Example Svelte application for testing
- **`demo/esp32/`**: PlatformIO project demonstrating Arduino framework usage
- **`demo/esp32idf/`**: ESP-IDF native project example

The `package.script` file contains comprehensive test scenarios that generate all combinations of ETag/gzip settings for validation.

## Important Notes

- The tool processes entire directories recursively and embeds all files as binary data
- Generated header files can be large but compile efficiently
- Memory usage is optimized through const array placement in program memory
- The CLI is designed for CI/CD integration with npm packaging workflows
