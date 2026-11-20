# Demos

`demo/svelte` is the embedded frontend. `demo/esp32` (the three Arduino engines) and `demo/esp32idf` register hand-written `GET /api/status` / `POST /api/toggle` handlers alongside the generated routes — the reference for anything touching route registration (`computeRouteCount`, `--spa`).

**Header variants.** `./package.script` regenerates one header per etag/gzip combination into `demo/{esp32,esp32idf}/include/<variant>/`, the dir name encoding the flags: `_` neither, `e` etag=always, `g` gzip=always, `c` …=compiler — so `eg` is `--etag=always --gzip=always`, `ecgc` is both `=compiler`. Each PlatformIO env `-I`s one variant dir; that is how every etag × gzip × engine combination gets compiled. Exception: `demo/esp32idf/include/spa/` (env `idf_SPA`) encodes CLI flags instead — `--spa --basepath=/ui` on top of `--etag=always --gzip=always` — and is the **only** env compiling the SPA catch-all and the basePath guard.

These headers are gitignored (`include/**/*.h`) and never appear in `git diff` — regenerate, don't hand-edit. `demo/esp32/include/svelteesp32.h` (top level) is the `dev:*` target. `demo/esp32/src/credentials.h` is gitignored too but must exist (`ssid` / `pass`) or the builds won't compile.
