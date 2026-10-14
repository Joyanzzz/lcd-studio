# Política de privacidad

**Tus datos nunca salen de tu dispositivo.**

- LCD Studio no tiene servidor de aplicación, cuentas de usuario, nube,
  telemetría, analítica, publicidad ni seguimiento.
- Los proyectos, las imágenes que importas y los archivos que exportas se
  procesan localmente, en el navegador o en la aplicación de escritorio.
- La aplicación no hace peticiones de red con tus datos ni carga recursos de
  terceros (fuentes, scripts, iconos o estilos van incluidos).

## Qué se guarda y dónde

| Dato | Dónde | Para qué |
| ---- | ----- | -------- |
| Copia de recuperación del proyecto (actual y anterior) | IndexedDB de tu navegador o de la aplicación de escritorio | Recuperar el trabajo tras recargar o un cierre inesperado. |
| Preferencias (idioma, tema, opciones de exportación) | `localStorage` | Recordar tu configuración. |
| Caché de la aplicación (service worker, solo web) | Caché del navegador | Funcionar sin conexión. |
| Archivos que guardas o exportas | Donde tú elijas | — |

Puedes borrar estos datos desde la configuración de privacidad del navegador
(datos del sitio) o, en escritorio, borrando la carpeta
`%LOCALAPPDATA%\com.lcdstudio.desktop`.

## Versión web en un servidor

Si usas LCD Studio desde un servidor web, ese servidor solo entrega los
archivos de la aplicación (como cualquier sitio). Tus proyectos permanecen en
tu navegador y nunca se envían al servidor.

## Escritorio

La aplicación de escritorio no se conecta a Internet. El instalador puede
descargar el componente WebView2 de Microsoft únicamente si Windows no lo
tiene instalado. La primera versión no incluye actualizaciones automáticas.
