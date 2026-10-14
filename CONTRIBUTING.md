# Contribuir

## Preparación

```bash
npm ci
npx playwright install
npm run dev
```

Para escritorio, ver `docs/desktop-build.md`.

## Antes de enviar cambios

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
```

Si tocas exportadores Arduino, ejecuta también
`ARDUINO_CLI=arduino-cli node scripts/arduino-check.ts`.

## Normas

- **Capas**: `src/core`, `src/engine`, `src/exporters` y
  `src/device-profiles` no pueden importar React, el DOM ni Tauri.
- **Límites**: cualquier número máximo va en `src/core/limits.ts`.
- **Textos**: nunca escribas texto visible en el código. Añade la clave a
  `src/ui/i18n/es.ts` y su traducción a `src/ui/i18n/en.ts`; el núcleo
  devuelve códigos, no frases.
- **Exportadores**: deben ser deterministas, declarar sus restricciones,
  validar antes de generar y tener pruebas de referencia. No marques una
  combinación como verificada sin compilación o prueba física
  (`docs/hardware-validation.md`).
- **Seguridad**: sin `eval`, `new Function`, `innerHTML`, estilos en línea ni
  recursos remotos. ESLint lo comprueba.
- **Dependencias**: solo si el navegador o el runtime no lo resuelven de
  forma pequeña y comprobable; versión exacta y licencia compatible. Después
  de cambiar dependencias npm de producción o crates de Rust, ejecuta
  `npm run notices` para regenerar los avisos de licencia (CI comprueba que
  estén al día).
- **Commits**: mensajes convencionales (`feat:`, `fix:`, `docs:`, `test:`,
  `chore:`), en español o inglés.
