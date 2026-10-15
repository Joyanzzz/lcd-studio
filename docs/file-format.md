# Formato de proyecto `.lcdstudio.json`

Archivo de texto UTF-8 con un único objeto JSON. Esquema actual: **versión 3**.
Implementación: `src/core/project-format.ts` (validación con Zod),
`src/core/device.ts` (configuración del dispositivo) y `src/core/migrate-v1.ts`
(migración desde el prototipo).

Historial del esquema:

| Versión | Cambios                                                                                  |
| ------- | ---------------------------------------------------------------------------------------- |
| v1      | Prototipo de un solo archivo. Se migra al abrirlo (ver abajo).                            |
| v2      | Perfil, apariencia, ROM, reproducción y fotogramas.                                       |
| v3      | Añade `device`: conexión, destino de código y, en matrices de LEDs, giro, cableado, brillo. |

Los archivos v1 y v2 se abren completos (nunca se descarta contenido) y se
guardan como v3. Un archivo v3 **no** se abre con LCD Studio 1.0.0 (que solo
conoce v2): la aplicación antigua lo rechaza con «versión más reciente».

Por eso, al abrir un v1 o un v2 el proyecto queda marcado como pendiente de
guardar y, en escritorio, «Guardar» (que reescribiría ese mismo archivo)
pregunta antes: **Guardar una copia…** (recomendado, deja el original
intacto), **Sobrescribir** o **Cancelar**. En la web, guardar siempre descarga
un archivo nuevo, así que el original nunca se sobrescribe.

## Ejemplo

```json
{
  "format": "lcd-studio-project",
  "schemaVersion": 3,
  "generator": { "name": "LCD Studio", "version": "1.0.0" },
  "name": "Mi animación",
  "profile": "hd44780-16x2",
  "width": 80,
  "height": 16,
  "appearance": { "palette": "lm016l" },
  "romCharset": "none",
  "device": {
    "connection": "hd44780-4bit",
    "codeTarget": "arduino-liquidcrystal",
    "matrix": null
  },
  "playback": { "loop": "loop" },
  "pixelEncoding": "bitpack-lsb-rowmajor",
  "frames": [{ "durationMs": 200, "pixels": "AAAA…" }]
}
```

## Campos

| Campo           | Tipo                       | Reglas                                                                                        |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `format`        | texto                      | Exactamente `lcd-studio-project`.                                                             |
| `schemaVersion` | entero                     | `3` (también se aceptan `2`, migrado). Un número mayor se rechaza con «creado con una versión más reciente». |
| `generator`     | objeto                     | `name` (1–64) y `version` (1–32). Solo informativo.                                           |
| `name`          | texto                      | 1–64 puntos de código, sin caracteres de control ni espacios al inicio o al final.            |
| `profile`       | texto                      | Identificador de un perfil existente (`docs/device-profiles.md`).                             |
| `width`/`height`| enteros                    | 1–512. Deben coincidir con el perfil (salvo `graphic-custom`, que los define).                |
| `appearance`    | objeto                     | `{ "palette": "<id>" }` o `{ "palette": "custom", "colors": { frame, screen, off, on } }` con colores `#rrggbb` en minúsculas. |
| `romCharset`    | texto                      | `none` o `hd44780-a00`. Solo los LCD de caracteres admiten otra cosa que `none`.              |
| `device.connection` | texto o `null`         | Conexión admitida por el perfil (tabla en `docs/device-profiles.md`) o `null` (sin configurar). |
| `device.codeTarget` | texto o `null`         | Exportador de código compatible con el perfil y la conexión, o `null` («solo diseño»).        |
| `device.matrix` | objeto o `null`            | Solo matrices de LEDs (obligatorio en ellas): `rotation` 0/90/180/270, `wiring` (`rows-msb-left`, `rows-lsb-left`, `cols-msb-top`, `cols-lsb-top`) y `brightness` 0–15. En otras pantallas debe ser `null`. |
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
9. Invariantes finales del proyecto, incluida la coherencia de `device` con
   el perfil (conexión, destino y matriz).

Un LCD de caracteres con fotogramas de más de 8 caracteres propios **sí se
abre** (proyecto en reparación): el límite se aplica a las ediciones y a la
exportación de código, no a la carga.

Si algo falla, se informa el primer error con su ruta (`frames.3.pixels`) y
**no se abre nada**. El análisis se ejecuta en un Web Worker.

## Determinismo

La serialización es determinista: el mismo proyecto produce los mismos bytes
(orden fijo de claves, sangría de 2 espacios, salto de línea final `\n`).

## Migración desde v2

Un documento v2 se valida con el esquema v2 (sin la clave `device`, que en v2
no existe y se rechaza) y se abre con `device = { connection: null,
codeTarget: null, matrix: null }`. Se muestra el aviso `migration.fromV2`.
Al guardar se escribe v3.

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
