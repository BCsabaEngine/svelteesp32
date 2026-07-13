# Svelte DEMO app

This is a DEMO application that serves the purpose of being able to demonstrate the capabilities of SvelteESP32.

With minimal functionality, it can emulate a working Svelte application, which has the translated application in the DIST folder, which can be installed on the ESP32. Thus, ESP32 can serve this reactive application consisting only of HTML, JS and CSS files.

## How it works

`src/App.svelte` renders an uptime/LED status card and a "Toggle LED" button. On mount, and after every toggle, it calls the JSON endpoints `GET /api/status` and `POST /api/toggle`, which the firmware implements alongside the static files served from this app's build output — one handler each for the `psychic`, `async` and `webserver` engines in `../esp32/src`, and the `espidf` equivalent in `../esp32idf/src/main.c`. So the same board serves both the UI and its live data. Building this app (`npm run build`) produces the `dist` folder; the root project's `npm run dev:psychic` / `dev:async` / `dev:webserver` watches `src/index.ts` and converts that `dist` folder into `demo/esp32/include/svelteesp32.h`, the C++ header actually flashed onto the ESP32 via PlatformIO (`npm run test:esp32` from the repo root).

## `dist` is committed on purpose

Unlike a normal Svelte project, `dist` is checked into git rather than ignored. Every generated header in the repo — the 37 variants that `./package.script` writes into `../esp32/include/` and `../esp32idf/include/` — is built from it, so committing `dist` is what lets those headers (and the PlatformIO builds) be regenerated without installing this app's dependencies or running a Svelte build at all.

The practical consequence: if you rebuild this app, Vite emits new content-hashed asset filenames (`assets/index-<hash>.js`), which change the `SVELTEESP32_FILE_*` defines and the ETag hashes in every generated header. Commit the new `dist` when that happens, and treat any unexpected `dist` diff as a real change rather than build noise.
