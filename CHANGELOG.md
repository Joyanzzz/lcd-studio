# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado semántico.

## [1.0.0] - 2026-10-13

Reconstrucción completa a partir del prototipo de un solo archivo.

### Añadido
- Editor de píxeles: lápiz, borrador, línea, rectángulo, elipse (contorno o
  relleno), relleno por área, texto 5×7, selección con mover/copiar/cortar/
  pegar, simetría, invertir, limpiar, voltear y desplazar; edición con teclado.
- Animación: fotogramas con duración propia (20–60 000 ms), reproducción en
  bucle, ida y vuelta o una vez, duplicar, borrar, reordenar (teclado y
  arrastre) y papel cebolla.
- Perfiles HD44780 16×2, 20×2, 16×4 y 20×4 con mapa DDRAM explícito, y
  pantallas gráficas SSD1306, PCD8544, KS0108 y personalizada (1–512 px).
- Análisis CGRAM que bloquea la exportación y lista las celdas incompatibles.
- Importación de PNG, JPEG, WebP y GIF animado en un worker, con encuadre,
  niveles, gamma, brillo, contraste, umbral e inversión, y tramados
  Floyd–Steinberg, Atkinson, Sierra Lite y Bayer 4×4/8×8.
- Exportadores: Adafruit_GFX, U8g2/XBM, páginas verticales, Arduino
  LiquidCrystal, LiquidCrystal_I2C, caracteres 5×8, binario, ASCII, PNG, hoja
  de sprites y GIF; PIC XC8 como experimental.
- Formato `.lcdstudio.json` v2 con validación estricta y migración desde v1.
- Autoguardado en IndexedDB con copia anterior y recuperación.
- Interfaz estilo Windows 2000 clara y oscura, accesible, desde 360 px.
- Español e inglés, con detección del idioma del sistema en el primer inicio.
- PWA instalable que funciona sin conexión.
- Aplicación de escritorio para Windows (Tauri 2) con diálogos nativos y
  escritura atómica.

### Eliminado (respecto al prototipo)
- LCD de caracteres sin mapa DDRAM verificado (16×1, 8×2, 24×2, 40×2 y
  personalizadas) y coincidencia ROM sin verificar por omisión.
- Tramado «Ruido» y literales binarios `Bxxxxxxxx`.
