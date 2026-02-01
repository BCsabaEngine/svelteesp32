import path from 'node:path';

import { cyanLog, redLog, yellowLog } from './consoleColor';

/**
 * Get human-readable engine name
 */
function getEngineName(engine: string): string {
  const names: Record<string, string> = {
    psychic: 'PsychicHttpServer',
    psychic2: 'PsychicHttpServer V2',
    async: 'ESPAsyncWebServer',
    espidf: 'ESP-IDF'
  };
  return names[engine] ?? engine;
}

/**
 * Error: Missing index.html or index.htm
 */
export function getMissingIndexError(engine: string): string {
  const hints: Record<string, string> = {
    psychic: `  1. Add an index.html file to your source directory
  2. The file will automatically be set as the default route ("/")
  3. PsychicHttpServer uses: server->defaultEndpoint = ...`,

    psychic2: `  1. Add an index.html file to your source directory
  2. The file will automatically be set as the default route ("/")
  3. PsychicHttpServer V2 uses: server->defaultEndpoint = ...`,

    async: `  1. Add an index.html file to your source directory
  2. The file will automatically create a "/" route handler
  3. ESPAsyncWebServer uses: server.on("/", HTTP_GET, ...)`,

    espidf: `  1. Add an index.html file to your source directory
  2. The file will register both "/" and "/index.html" routes
  3. ESP-IDF uses: httpd_register_uri_handler(server, &route_def_...)`
  };

  const hint = hints[engine] ?? hints['psychic'];

  return (
    redLog('[ERROR] No index.html or index.htm found in source files') +
    `

Why this matters:
  Web applications typically need a default entry point. Without index.html,
  users visiting http://your-esp32/ will get a 404 error.

How to fix (for ${getEngineName(engine)}):
${hint}

Alternative:
  If you use a different entry point (e.g., main.html), you can add --noindexcheck flag,
  but users must navigate to http://your-esp32/main.html explicitly.`
  );
}

/**
 * Error: Invalid engine specified
 */
export function getInvalidEngineError(attempted: string): string {
  return (
    redLog(`[ERROR] Invalid engine: '${attempted}'`) +
    `

Valid engines are:
  ${cyanLog('• psychic')}    - PsychicHttpServer (ESP32 only, fastest performance)
  ${cyanLog('• psychic2')}   - PsychicHttpServer V2 (ESP32 only, modern API)
  ${cyanLog('• async')}      - ESPAsyncWebServer (ESP32/ESP8266 compatible)
  ${cyanLog('• espidf')}     - Native ESP-IDF web server (ESP32 only, no Arduino)

How to fix:
  npx svelteesp32 --engine=psychic --sourcepath=./dist

Example RC file (.svelteesp32rc.json):
  {
    "engine": "psychic",
    "sourcepath": "./dist"
  }

Documentation: https://github.com/hpieroni/svelteesp32#readme`
  );
}

/**
 * Error: Source path not found or not a directory
 */
export function getSourcepathNotFoundError(sourcepath: string, reason: 'not_found' | 'not_directory'): string {
  if (reason === 'not_directory')
    return (
      redLog(`[ERROR] Source path is not a directory: '${sourcepath}'`) +
      `

The --sourcepath option must point to a directory containing your built web files,
not an individual file.

How to fix:
  npx svelteesp32 --sourcepath=./dist --engine=psychic`
    );

  const resolvedPath = path.resolve(sourcepath);
  const currentDirectory = process.cwd();

  return (
    redLog(`[ERROR] Source directory not found: '${sourcepath}'`) +
    `

Why this matters:
  SvelteESP32 needs your compiled web assets (HTML, CSS, JS) to convert them
  into C++ header files for the ESP32.

How to fix:
  1. Build your frontend application first:
     • Svelte:  npm run build
     • React:   npm run build
     • Vue:     npm run build
     • Angular: ng build

  2. Verify the build output directory exists:
     ${cyanLog(`ls -la ${sourcepath}`)}

  3. Check your build tool configuration:
     • Vite:    vite.config.js → build.outDir
     • Webpack: webpack.config.js → output.path
     • Rollup:  rollup.config.js → output.dir

  4. Update your svelteesp32 command to match:
     ${cyanLog(`npx svelteesp32 --sourcepath=./build --engine=psychic`)}

Current directory: ${currentDirectory}
Attempted path: ${resolvedPath} (resolved)`
  );
}

/**
 * Error: Size budget exceeded
 */
export function getSizeBudgetExceededError(type: 'size' | 'gzipSize', limit: number, actual: number): string {
  const typeLabel = type === 'size' ? 'Uncompressed' : 'Gzip';
  const flagName = type === 'size' ? '--maxsize' : '--maxgzipsize';
  const overage = actual - limit;
  const overagePercent = Math.round((overage / limit) * 100);

  return (
    redLog(`[ERROR] ${typeLabel} size budget exceeded`) +
    `

Budget:   ${limit.toLocaleString()} bytes
Actual:   ${actual.toLocaleString()} bytes
Overage:  ${overage.toLocaleString()} bytes (+${overagePercent}%)

Why this matters:
  Size budgets help prevent frontend bloat and ensure your application
  fits within ESP32 flash memory constraints.

How to fix:
  1. Reduce bundle size (tree-shaking, code splitting, smaller dependencies)
  2. Optimize assets (compress images, minify CSS/JS)
  3. Remove unused files with --exclude patterns
  4. Increase the budget: ${flagName}=${actual}

CI integration:
  This non-zero exit code allows build pipelines to fail early when
  the frontend exceeds allocated flash space.`
  );
}

/**
 * Hint: max_uri_handlers configuration (console output, not an error)
 */
export function getMaxUriHandlersHint(engine: string, routeCount: number): string {
  const recommended = routeCount + 5;

  const hints: Record<string, string> = {
    psychic: `PsychicHttpServer server;
  server.config.max_uri_handlers = ${recommended};  // Default is 8, you need at least ${routeCount}
  initSvelteStaticFiles(&server);
  server.listen(80);`,

    psychic2: `PsychicHttpServer server;
  server.config.max_uri_handlers = ${recommended};  // Default is 8, you need at least ${routeCount}
  initSvelteStaticFiles(&server);
  server.listen(80);`,

    espidf: `httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = ${recommended};  // Default is 8, you need at least ${routeCount}
  httpd_handle_t server = NULL;
  httpd_start(&server, &config);
  initSvelteStaticFiles(server);`
  };

  const hint = hints[engine];
  if (!hint) return ''; // No hint for async engine (no limit)

  return (
    yellowLog('[CONFIG TIP] max_uri_handlers configuration') +
    `

Your generated code includes ${routeCount} routes. Make sure your server can handle them:

For ${getEngineName(engine)}:
  ${hint}

Recommended formula: max_uri_handlers = file_count + 5 (safety margin)

Runtime symptoms if too low:
  • Routes not registered (HTTP 404 errors)
  • ESP_ERR_HTTPD_HANDLERS_FULL error in logs
  • Some files load, others don't (random behavior)`
  );
}
