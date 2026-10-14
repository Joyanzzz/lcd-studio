# Formato de proyecto `.lcdstudio.json`

Archivo de texto UTF-8 con un único objeto JSON. Esquema actual: **versión 2**.
Implementación: `src/core/project-format.ts` (validación con Zod) y
`src/core/migrate-v1.ts` (migración desde el prototipo).

## Ejemplo

```json
{
  "format": "lcd-studio-project",
  "schemaVersion": 2,
  "generator": { "name": "LCD Studio", "version": "1.0.0" },
  "name": "Mi animación",
  "profile": "hd44780-16x2",
  "width": 80,
  "height": 16,
  "appearance": { "palette": "lm016l" },
  "romCharset": "none",
  "playback": { "loop": "loop" },
  "pixelEncoding": "bitpack-lsb-rowmajor",
  "frames": [{ "durationMs": 200, "pixels": "AAAA…" }]
}
```

## Campos

| Campo           | Tipo                       | Reglas                                                                                        |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `format`        | texto                      | Exactamente `lcd-studio-project`.                                                             |
| `schemaVersion` | entero                     | `2`. Un número mayor se rechaza con «creado con una versión más reciente».                    |
| `generator`     | objeto                     | `name` (1–64) y `version` (1–32). Solo informativo.                                           |
| `name`          | texto                      | 1–64 puntos de código, sin caracteres de control ni espacios al inicio o al final.            |
| `profile`       | texto                      | Identificador de un perfil existente (`docs/device-profiles.md`).                             |
| `width`/`height`| enteros                    | 1–512. Deben coincidir con el perfil (salvo `graphic-custom`, que los define).                |
| `appearance`    | objeto                     | `{ "palette": "<id>" }` o `{ "palette": "custom", "colors": { frame, screen, off, on } }` con colores `#rrggbb` en minúsculas. |
| `romCharset`    | texto                      | `none` o `hd44780-a00`. Las pantallas gráficas solo admiten `none`.                           |
| `playback.loop` | texto                      | `loop`, `pingpong` u `once`.                                                                  |
| `pixelEncoding` | texto                      | Exactamente `bitpack-lsb-rowmajor`.                                                           |
| `frames`        | lista                      | 1–240 elementos.                                                                              |
| `frames[].durationMs` | entero               | 20–60 000.                                                                                    |
| `frames[].pixels`     | texto base64          | Base64 estándar con relleno, canónica (ver abajo).                                            |

No se admiten claves adicionales en ningún nivel (incluida `__proto__`).

## Píxeles

Fila por fila desde la esquina superior izquierda. El píxel `i` (`i = y·ancho + x`)
ocupa el bit `i & 7` del byte `i >> 3` (LSB primero). La longitud exacta es
`ceil(ancho·alto / 8)` bytes; los bits sobrantes del último byte deben valer 0.
El texto base64 debe tener exactamente `4·ceil(bytes/3)` caracteres.

## Validación (todo o nada)

Antes de modificar el proyecto abierto se comprueba, en este orden:

1. Tamaño del archivo ≤ 20 MiB y que no esté vacío.
2. UTF-8 válido y JSON válido.
3. Identificador de formato y versión reconocidos.
4. Número de fotogramas ≤ 240 (antes de recorrer la lista).
5. Esquema estricto: tipos, rangos, claves permitidas, colores.
6. Perfil existente y dimensiones coherentes con él.
7. Memoria esperada (`ancho × alto × fotogramas`) antes de reservarla.
8. Longitud exacta de cada base64, base64 canónica, longitud exacta del
   bitmap y bits de relleno a cero.
9. Invariantes finales del proyecto.

Si algo falla, se informa el primer error con su ruta (`frames.3.pixels`) y
**no se abre nada**. El análisis se ejecuta en un Web Worker.

## Determinismo

La serialización es determinista: el mismo proyecto produce los mismos bytes
(orden fijo de claves, sangría de 2 espacios, salto de línea final `\n`).

## Migración desde v1 (prototipo)

Forma v1:

```json
{ "v": 1, "preset": "lm016l",
  "disp": { "kind": "char", "cols": 16, "rows": 2, "w": 80, "h": 16 },
  "theme": "lm016l",
  "custom": { "label": "…", "frame": "#…", "screen": "#…", "off": "#…", "on": "#…", "flat": false },
  "frames": [ { "d": 200, "b": "<base64>" } ] }
```

| v1                                   | v2                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `disp.kind = "char"` 16×2/20×2/16×4/20×4 | Perfil `hd44780-*` correspondiente.                                   |
| `disp.kind = "char"` con otra geometría (8×2, 16×1, 24×2, 40×2, personalizada) | `graphic-custom` del mismo tamaño en píxeles, **con aviso** (no hay mapa DDRAM verificado). |
| `disp.kind = "gfx"`, preset `g84x48` | `pcd8544-84x48`.                                                         |
| Otro `gfx`                           | `graphic-custom` con las mismas dimensiones.                            |
| `theme` conocido                     | Misma paleta (`oledb` → `oled-blue`).                                   |
| `theme = "custom"`                   | Paleta personalizada con colores normalizados a `#rrggbb`.              |
| `theme` desconocido                  | Paleta por omisión, con aviso.                                           |
| `d < 20`                             | 20 ms, con aviso (el prototipo admitía 10 ms).                           |
| `d = 0`                              | 200 ms, con aviso (el prototipo hacía `d || 200`).                       |
| Sin nombre                           | Nombre del archivo, o «proyecto migrado» en el idioma activo.            |
| —                                    | `loop`, `romCharset: "none"`.                                            |

Se rechazan v1 con claves desconocidas, tipos incorrectos, `w ≠ cols·5`,
más de 240 fotogramas, lienzos de más de 512 px, base64 no canónica o con
longitud incorrecta y bits de relleno alterados. Las pruebas con archivos
reales están en `tests/fixtures/projects/` y `tests/unit/core/project-format.test.ts`.
