# Svelte DEMO app

This is a DEMO application that serves the purpose of being able to demonstrate the capabilities of SvelteESP32.

With minimal functionality, it can emulate a working Svelte application, which has the translated application in the DIST folder, which can be installed on the ESP32. Thus, ESP32 can serve this reactive application consisting only of HTML, JS and CSS files.

## How it works

`src/App.svelte` renders an uptime/LED status card and a "Toggle LED" button. On mount, and after every toggle, it calls the JSON endpoints `GET /api/status` and `POST /api/toggle`, which the firmware in `../esp32/src` (one handler each for the `psychic`, `async` and `webserver` engines) implements alongside the static files served from this app's build output — so the same board serves both the UI and its live data. Building this app (`npm run build`) produces the `dist` folder; the root project's `npm run dev:psychic` / `dev:async` / `dev:webserver` watches `src/index.ts` and converts that `dist` folder into `demo/esp32/include/svelteesp32.h`, the C++ header actually flashed onto the ESP32 via PlatformIO (`npm run test:esp32` from the repo root).
