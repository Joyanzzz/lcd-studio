# Seguridad

## Versiones con soporte

| Versión | Soporte |
| ------- | ------- |
| 1.x     | Sí      |

## Informar de una vulnerabilidad

No abras un *issue* público. Usa la función «Report a vulnerability»
(avisos de seguridad privados) del repositorio en GitHub e incluye:

- versión (web o escritorio) y sistema operativo;
- pasos o archivo para reproducirlo (por ejemplo, un `.lcdstudio.json` o una
  imagen que provoque el problema);
- impacto estimado.

Se acusará recibo en un plazo razonable y se publicará una corrección con
crédito si lo deseas.

## Modelo de seguridad

LCD Studio procesa localmente archivos que elige el usuario y no usa red.
Las medidas (validación estricta, límites de memoria, workers con
cancelación, CSP, permisos mínimos de Tauri, escritura atómica) se describen
en `docs/security-review.md`.
