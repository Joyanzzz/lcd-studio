/** CRC-32 (polinomio reflejado 0xEDB88320), usado por PNG y ZIP. */

const TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Actualiza un CRC parcial; empieza con `0xFFFFFFFF` y termina con `^ 0xFFFFFFFF`. */
export function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]!) & 255]! ^ (c >>> 8);
  return c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  return (crc32Update(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}
