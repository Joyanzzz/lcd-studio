**English** · [Español](README.es.md)

# LCD Studio

Pixel-by-pixel animation editor for HD44780 character LCDs, monochrome
graphic displays (SSD1306, PCD8544, KS0108 or a custom size) and 8×8 LED
matrices driven by a MAX7219. It exports Arduino code, bitmap data and
images.

> **Beta (1.1.0-beta.1).** Everything described here is implemented and
> covered by automated tests, but **no export has been tested on physical
> hardware yet**. Generated Arduino code compiles; that does not prove that
> a real display shows the right image. See [Limitations](#limitations).

LCD Studio runs entirely on your device: no accounts, no application server,
no telemetry and no remote resources. It is distributed as a static web app,
as a PWA that works offline, and as a desktop app for Windows 10/11 x64.

## Features

- **Editor**: pencil, eraser, line, rectangle and ellipse (outline or
  filled), flood fill, 5×7 text, selection with move/copy/cut/paste,
  symmetry, invert, clear, flip and shift, undo/redo. Everything works from
  the keyboard ([shortcuts](docs/keyboard-shortcuts.md), in Spanish).
- **Animation**: up to 240 frames with their own duration (20–60 000 ms),
  loop, ping-pong or play once, duplicate, delete, reorder and onion skin.
- **Displays**: HD44780 16×2, 20×2, 16×4 and 20×4 with an explicit DDRAM
  map; graphic displays from 1 to 512 px; 8×8 LED matrix (MAX7219) with
  configurable physical rotation, wiring and brightness, plus diagnostic
  patterns. On character LCDs the 8 custom-character limit is enforced while
  editing: repeating a pattern is free, and an operation that would create a
  ninth one is rejected as a whole with a single notice.
- **Fit to 8 characters** (optional, lossy): when a frame needs more than 8
  custom patterns, this tool shows a before/after preview and replaces the
  extra cells with the closest pattern, a character of the chosen ROM map or
  a space, as one undoable edit. Exports never substitute anything on their
  own.
- **Guided projects**: new-project wizard (display, connection and platform,
  or design only), display conversion with preview, and device settings
  stored in the project.
- **Image import**: PNG, JPEG, WebP and animated GIF, with framing, levels
  and Floyd–Steinberg, Atkinson, Sierra Lite or Bayer dithering.
- **Export wizard** (frame, selection or animation): Adafruit_GFX,
  U8g2/XBM, vertical pages, Arduino LiquidCrystal and LiquidCrystal_I2C,
  MAX7219, 5×8 characters, binary, ASCII, PNG, sprite sheet and GIF; PIC XC8
  as **experimental** ([formats](docs/export-formats.md), in Spanish).
- **Projects**: versioned `.lcdstudio.json` files with strict validation and
  migration from earlier formats ([file format](docs/file-format.md), in
  Spanish). Saving over a file from an earlier format asks first and offers
  to save a copy.
- **Autosave** to local browser storage, with the previous copy and recovery.
- Windows 2000-style interface with a menu bar, light and dark themes,
  Spanish and English; drawing and animation side by side, also on phones in
  portrait and landscape (from 360 px wide).

## Use it

- **Web / PWA**: planned at `https://lcd.joyanz.site` (not deployed yet).
  Once loaded, it can be installed from the browser and keeps working
  offline.
- **Windows**: download `LCD Studio_1.1.0-beta.1_x64-setup.exe` from the
  [GitHub releases page](https://github.com/Joyanzzz/lcd-studio/releases) and check its SHA-256
  against `SHA256SUMS.txt`. The installer is **not code-signed**, so Windows
  SmartScreen may warn about an unknown publisher. It installs for the
  current user only and does not need administrator rights. If WebView2 is
  missing (rare on up-to-date Windows 10 and on Windows 11), the installer
  downloads it from Microsoft, so that case needs an internet connection.
  The app itself works offline.

Projects are saved with **File → Save** as `.lcdstudio.json`. Exports
(images, data, code) are separate files: exporting never replaces the
project.

## Development

Requirements: Node.js ≥ 22.12 and npm. The desktop build also needs Rust
(see [docs/desktop-build.md](docs/desktop-build.md), in Spanish).

```bash
npm ci
npm run dev
```

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Development server. |
| `npm run build` | Production build in `dist/`. |
| `npm run preview` | Serves `dist/` with the security headers. |
| `npm run test` | Unit tests. |
| `npm run test:coverage` | Unit tests with coverage (90 % thresholds). |
| `npm run test:e2e` | End-to-end tests in Chromium, Firefox, WebKit and mobile, in Spanish and English. |
| `npm run lint` | ESLint and Prettier. |
| `npm run typecheck` | Type checking. |
| `npm run tauri:dev` | Desktop app in development mode. |
| `npm run tauri:build` | Windows installer. |
| `npm run arduino:check` | Compiles the generated Arduino sketches (requires `ARDUINO_CLI`). |
| `npm run audit:deps` | Dependency and license audit. |
| `npm run notices` | Regenerates `public/THIRD_PARTY_NOTICES.txt` (requires `cargo`). |
| `npm run bench` / `npm run bench:browser` | Performance measurements. |

`npm run tauri:build` rebuilds `dist/` without the `<meta>` CSP that the web
version needs (Tauri applies its own). Run `npm run build` again before
deploying the web version or running the end-to-end tests.

## Limitations

- **Hardware**: no combination has been tested on a physical display. What
  is implemented, compiled and physically tested is listed per exporter in
  [docs/hardware-validation.md](docs/hardware-validation.md) (in Spanish),
  together with test procedures for HD44780, SSD1306 and MAX7219.
- **Memory estimates** are compared against the compiler for the measured
  cases only (listed in the same document); they are not a guarantee for
  every project, board or library version.
- **PIC XC8** is experimental: the generated code has never been compiled
  with XC8. It only appears when experimental features are enabled in the
  preferences.
- **ROM map A00** is experimental: it was transcribed from the datasheet and
  not checked against a real module; modules with ROM A02 show other
  characters.
- **Firefox**: the end-to-end tests are configured for Firefox and run in CI,
  but they have not been run on the development machine (its security
  policy blocks the Firefox test browser).
- **Desktop installer**: unsigned; there is no automatic updater.

## Reporting a problem

[Open an issue](https://github.com/Joyanzzz/lcd-studio/issues/new/choose) with:

- the LCD Studio version (Help → Help and keyboard shortcuts…) and whether
  you use the web or the desktop version;
- browser or Windows version;
- the steps to reproduce it and what you expected;
- if it helps, a `.lcdstudio.json` that reproduces the problem — only if you
  are comfortable sharing it.

Do not include personal data. For security vulnerabilities, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Documentation

Most technical documents are in Spanish.

- [Architecture](docs/architecture.md) and [decisions](docs/decisions.md)
- [File format](docs/file-format.md)
- [Display profiles](docs/device-profiles.md)
- [Export formats](docs/export-formats.md)
- [Hardware validation](docs/hardware-validation.md)
- [Testing](docs/testing.md) and [performance](docs/performance.md)
- [Web deployment](docs/web-deployment.md)
- [Desktop build](docs/desktop-build.md)
- [Release procedure](docs/release.md)
- [Security review](docs/security-review.md)
- [Privacy](PRIVACY.md) · [Security](SECURITY.md) ·
  [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 Johann Pérez. Dependencies keep their own licenses; their notices
ship with the app in `THIRD_PARTY_NOTICES.txt` (production npm packages and
the Rust crates linked into the desktop executable), generated with
`npm run notices`. `npm run audit:deps` checks that every npm license is
permissive.
