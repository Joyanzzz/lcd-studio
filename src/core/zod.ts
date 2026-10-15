import { z } from 'zod';

/**
 * Zod configurado para una CSP estricta (`script-src 'self'`, sin
 * `unsafe-eval`). Sin `jitless`, Zod comprueba al crear cada esquema de objeto
 * si puede compilar validadores con `new Function`; la CSP lo bloquea y,
 * aunque Zod lo captura, el navegador registra una infracción de seguridad.
 * La configuración debe aplicarse antes de crear cualquier esquema, así que
 * todo el código importa `z` desde aquí y no desde `zod`.
 */
z.config({ jitless: true });

export { z };
