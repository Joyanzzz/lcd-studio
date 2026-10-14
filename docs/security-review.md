# Revisión de seguridad

## Superficie

LCD Studio procesa archivos que elige el usuario (proyectos e imágenes) y
genera archivos. No tiene servidor, cuentas ni red. Las amenazas relevantes
son archivos malformados o maliciosos y el agotamiento de recursos.

## Medidas

| Riesgo | Medida |
| ------ | ------ |
| Proyecto malicioso o dañado | Tamaño máximo antes de leer; UTF-8 estricto; esquema estricto (Zod) sin claves extra (incluida `__proto__`); límites de dimensiones, fotogramas y duraciones; base64 canónica; longitud exacta; memoria calculada antes de reservar; todo o nada. Se procesa en un worker. |
| Imagen maliciosa | Formato por firma (no por extensión); dimensiones leídas de la cabecera y limitadas a 16 MP antes de decodificar; 20 MiB comprimidos; worker con límite de tiempo (60 s) y cancelación por terminación; comprobación de que el decodificador devuelve las dimensiones de la cabecera. |
| GIF malicioso (`omggif`) | Ver auditoría abajo. Cuadros fuera del lienzo y número de cuadros se rechazan antes de decodificar; memoria de trabajo limitada a 192 MiB. |
| Código inyectado en la salida | Los identificadores C se generan con `[A-Za-z0-9_]` y se rechazan palabras clave; el texto del usuario en comentarios se limpia de `*/`, saltos de línea y caracteres de control; los pines y direcciones son números validados, nunca texto libre. |
| ZIP Slip | El escritor ZIP solo admite nombres planos validados (sin `/`, `\`, `..`, unidades ni nombres reservados), así que ninguna entrada sale del directorio de extracción. La aplicación no extrae ZIP. |
| XSS | React sin `dangerouslySetInnerHTML`; ESLint prohíbe `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` y estilos en línea. CSP estricta sin `unsafe-inline` ni `unsafe-eval`. |
| Red | Sin recursos remotos; CSP `connect-src 'self'` (web) e IPC (escritorio); las E2E fallan si hay peticiones a otros orígenes. |
| Escritorio | Rust abre los diálogos y escribe; JS no maneja rutas; sin `fs`/`shell`/`http`/`updater`; permisos explícitos por comando; navegación bloqueada a orígenes externos; `freezePrototype`. |
| Dependencias | Versiones exactas con lockfile; `npm audit`; comprobación de licencias (`scripts/check-licenses.ts`); avisos de licencia de npm y de los crates enlazados en `THIRD_PARTY_NOTICES.txt`, distribuido con la aplicación y comprobado en CI. |

## Auditoría de `omggif` 1.0.10 (decodificador)

Revisado `GifReader` y `GifReaderLZWOutputIndexStream`:

- **No valida** que los cuadros quepan en el lienzo lógico: con un cuadro
  fuera de él, `decodeAndBlitFrameRGBA` escribiría fuera de fila. → Se valida
  `x + ancho ≤ W` y `y + alto ≤ H` antes de decodificar.
- **Reserva `ancho × alto`** por cuadro sin límite (hasta 4 G). → Las
  dimensiones de cada cuadro quedan acotadas por las del lienzo, que a su vez
  se limitan a 16 MP.
- Lecturas fuera del búfer devuelven `undefined` (JavaScript, sin corrupción
  de memoria); el LZW termina cuando se llena la salida esperada.
- Tablas de códigos no se limpian tras un código *clear*; un flujo malicioso
  podría formar ciclos en la persecución de prefijos y no terminar. → Se
  ejecuta en un worker que la interfaz termina a los 60 s o al cancelar.
- Rechaza la extensión de texto plano (`0x01`): esos GIF (muy raros) no se
  pueden importar y se informa del error.

## Pendiente de verificar

- Revisión independiente del código Rust de escritorio.
- Análisis estático adicional (por ejemplo, CodeQL) en CI.
