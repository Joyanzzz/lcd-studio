/**
 * Construye documentos v1 con la misma forma que generaba el prototipo
 * (`projectJSON()`), para probar la migración sin depender de él.
 */

export function packLsb(px: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(px.length / 8));
  for (let i = 0; i < px.length; i++) if (px[i]) out[i >> 3]! |= 1 << (i & 7);
  return out;
}

export function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export interface V1Options {
  kind?: 'char' | 'gfx';
  cols?: number;
  rows?: number;
  w?: number;
  h?: number;
  preset?: string;
  theme?: string;
  frames?: { d: number; px: ArrayLike<number> }[];
}

export function makeV1(options: V1Options = {}): Record<string, unknown> {
  const kind = options.kind ?? 'char';
  const cols = options.cols ?? 16;
  const rows = options.rows ?? 2;
  const w = options.w ?? (kind === 'char' ? cols * 5 : 128);
  const h = options.h ?? (kind === 'char' ? rows * 8 : 64);
  const frames = options.frames ?? [
    {
      d: 200,
      px: Array.from({ length: w * h }, (_, i) => (i % 3 === 0 ? 1 : 0)),
    },
  ];
  return {
    v: 1,
    preset: options.preset ?? (kind === 'char' ? 'lm016l' : 'g128x64'),
    disp: kind === 'char' ? { kind, cols, rows, w, h } : { kind, w, h },
    theme: options.theme ?? 'lm016l',
    custom: {
      label: 'Personalizado',
      frame: '#202020',
      screen: '#3a7bd5',
      off: '#4a88e0',
      on: '#ffffff',
      flat: false,
    },
    frames: frames.map((f) => ({ d: f.d, b: b64(packLsb(f.px)) })),
  };
}

export function toBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
