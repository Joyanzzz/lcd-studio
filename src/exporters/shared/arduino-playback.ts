import type { LoopMode } from '../../core/project.ts';
import { HOLD_FUNCTION } from './avr.ts';

/**
 * Lógica de reproducción común a todos los bocetos Arduino. Recorre los
 * fotogramas igual que `nextPlaybackStep` (src/core/playback.ts):
 * bucle 0…n-1, ida y vuelta 0…n-1…1 y "una vez" 0…n-1 y se detiene.
 *
 * Requiere que el boceto defina `FRAME_COUNT`, `frameDurationMs(i)` y
 * `showFrame(i)`.
 */
export interface PlaybackParts {
  /** Inclusiones adicionales (`<avr/sleep.h>` si hace falta detenerse). */
  readonly includes: string;
  /** Funciones auxiliares antes de `setup()`. */
  readonly helpers: string;
  /** Final de `setup()` (después de inicializar la pantalla). */
  readonly setupTail: string;
  /** `loop()` completo. */
  readonly loop: string;
}

export function playbackParts(
  frameCount: number,
  mode: LoopMode,
  /** Incluir holdLastFrame() aunque la reproducción no lo necesite (p. ej. fallo al iniciar). */
  alwaysHold = false,
): PlaybackParts {
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error('Sin fotogramas');
  const single = frameCount === 1;
  const needsHold = alwaysHold || single || mode === 'once';
  const includes = needsHold ? '#include <avr/sleep.h>\n' : '';
  const helpers = needsHold ? HOLD_FUNCTION : '';

  if (single) {
    return {
      includes,
      helpers,
      setupTail: '  showFrame(0);\n  holdLastFrame();\n',
      loop: 'void loop() {\n  // No se llega aquí: holdLastFrame() detiene el microcontrolador.\n}\n',
    };
  }

  let advance: string;
  switch (mode) {
    case 'once':
      advance = `  if (frameIndex + 1 >= FRAME_COUNT) {
    holdLastFrame();
  }
  frameIndex++;
`;
      break;
    case 'pingpong':
      advance = `  if (forward && frameIndex + 1 >= FRAME_COUNT) {
    forward = false;
  } else if (!forward && frameIndex == 0) {
    forward = true;
  }
  if (forward) {
    frameIndex++;
  } else {
    frameIndex--;
  }
`;
      break;
    case 'loop':
    default:
      advance = `  frameIndex++;
  if (frameIndex >= FRAME_COUNT) {
    frameIndex = 0;
  }
`;
  }

  const state = `static uint16_t frameIndex = 0;
static uint32_t frameStartMs = 0;
${mode === 'pingpong' ? 'static bool forward = true;\n' : ''}`;

  return {
    includes,
    helpers: `${helpers}${helpers ? '\n' : ''}${state}`,
    setupTail: '  showFrame(0);\n  frameStartMs = millis();\n',
    loop: `void loop() {
  // Espera el resto de la duración del fotograma actual.
  const uint32_t elapsed = millis() - frameStartMs;
  const uint16_t duration = frameDurationMs(frameIndex);
  if (elapsed < duration) {
    delay(duration - elapsed);
  }
${advance}  frameStartMs = millis();
  showFrame(frameIndex);
}
`,
  };
}
