//! Parte nativa de LCD Studio (Tauri 2).
//!
//! Solo se encarga de lo que el WebView no puede hacer: diálogos nativos de
//! abrir/guardar y escritura atómica de archivos. Toda la lógica del editor y
//! de los exportadores vive en TypeScript y es la misma que en la versión web.
//!
//! Garantías:
//! - JavaScript nunca envía ni recibe rutas: solo bytes y un nombre sugerido.
//! - Solo se lee el archivo que el usuario elige y solo se escribe en el
//!   archivo que el usuario elige (o en el último proyecto que eligió).
//! - La escritura usa un archivo temporal en la misma carpeta y lo renombra
//!   sobre el destino; el diálogo nativo pide confirmación antes de
//!   sobrescribir.
//! - El WebView no puede navegar a orígenes remotos.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

/// Tamaño máximo de un proyecto (igual que `LIMITS.projectMaxFileBytes`).
const MAX_PROJECT_BYTES: u64 = 20 * 1024 * 1024;
/// Tamaño máximo de un archivo exportado que se acepta escribir.
const MAX_EXPORT_BYTES: usize = 256 * 1024 * 1024;
/// Longitud máxima del nombre sugerido (en caracteres).
const MAX_NAME_CHARS: usize = 96;

/// Archivo de proyecto actual y el último elegido en "Abrir" (pendiente de validar).
#[derive(Default)]
struct ProjectFiles {
    current: Mutex<Option<PathBuf>>,
    pending: Mutex<Option<PathBuf>>,
}

/// Decodifica `%XX` (las cabeceras solo admiten ASCII; el nombre viaja codificado).
fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = input.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(percent_decode)
}

/// Deja solo un nombre de archivo: sin rutas, sin caracteres reservados ni de control.
fn sanitize_file_name(name: &str, fallback: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .take(MAX_NAME_CHARS)
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn raw_body(request: &Request<'_>, max: usize) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) if bytes.len() <= max => Ok(bytes.clone()),
        InvokeBody::Raw(_) => Err("project.fileTooLarge".into()),
        _ => Err("platform.badResponse".into()),
    }
}

/// Escribe primero en un temporal de la misma carpeta y después lo renombra
/// sobre el destino (reemplazo atómico en el mismo volumen).
fn atomic_write(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "sin carpeta"))?;
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "nombre no válido"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!(".{name}.{}.{nonce}.tmp", std::process::id()));
    let result = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string()
}

/// Muestra "Abrir" y devuelve `[u32 LE longitud del nombre][nombre][contenido]`
/// (vacío si el usuario cancela). El archivo queda pendiente hasta que la
/// interfaz confirme que es un proyecto válido.
#[tauri::command]
async fn open_project(app: AppHandle, files: State<'_, ProjectFiles>) -> Result<Response, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("LCD Studio", &["json"])
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(Response::new(Vec::new()));
    };
    let path = picked.into_path().map_err(|_| "platform.ioError".to_string())?;
    let meta = fs::metadata(&path).map_err(|_| "platform.ioError".to_string())?;
    if meta.len() > MAX_PROJECT_BYTES {
        return Err("project.fileTooLarge".into());
    }
    let content = fs::read(&path).map_err(|_| "platform.ioError".to_string())?;
    let name = file_name_of(&path);
    let name_bytes = name.as_bytes();
    let mut out = Vec::with_capacity(4 + name_bytes.len() + content.len());
    out.extend_from_slice(&(name_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(name_bytes);
    out.extend_from_slice(&content);
    *files.pending.lock().map_err(|_| "platform.ioError")? = Some(path);
    Ok(Response::new(out))
}

/// La interfaz validó el proyecto abierto: "Guardar" escribirá en ese archivo.
#[tauri::command]
fn accept_opened_project(files: State<'_, ProjectFiles>) -> Result<(), String> {
    let pending = files.pending.lock().map_err(|_| "platform.ioError")?.take();
    if let Some(path) = pending {
        *files.current.lock().map_err(|_| "platform.ioError")? = Some(path);
    }
    Ok(())
}

/// Guarda el proyecto. Modo `save`: reutiliza el archivo actual si existe.
/// Modo `saveAs` o sin archivo: diálogo nativo. Devuelve el nombre o `null`.
#[tauri::command]
async fn save_project(
    app: AppHandle,
    files: State<'_, ProjectFiles>,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let bytes = raw_body(&request, MAX_PROJECT_BYTES as usize)?;
    let mode = header(&request, "x-mode").unwrap_or_default();
    let suggested = sanitize_file_name(
        &header(&request, "x-file-name").unwrap_or_default(),
        "proyecto.lcdstudio.json",
    );
    let current = files.current.lock().map_err(|_| "platform.ioError")?.clone();
    let target = match (mode.as_str(), current) {
        ("save", Some(path)) => path,
        _ => {
            let Some(chosen) = app
                .dialog()
                .file()
                .add_filter("LCD Studio", &["json"])
                .set_file_name(&suggested)
                .blocking_save_file()
            else {
                return Ok(None);
            };
            chosen.into_path().map_err(|_| "platform.ioError".to_string())?
        }
    };
    atomic_write(&target, &bytes).map_err(|_| "platform.ioError".to_string())?;
    let name = file_name_of(&target);
    *files.current.lock().map_err(|_| "platform.ioError")? = Some(target);
    Ok(Some(name))
}

/// Guarda un archivo exportado en la ubicación que elija el usuario.
#[tauri::command]
async fn save_export(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let bytes = raw_body(&request, MAX_EXPORT_BYTES)?;
    let suggested = sanitize_file_name(&header(&request, "x-file-name").unwrap_or_default(), "export.bin");
    let extension = suggested.rsplit_once('.').map(|(_, e)| e.to_string());
    let mut dialog = app.dialog().file().set_file_name(&suggested);
    if let Some(ext) = extension.as_deref() {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let target = chosen.into_path().map_err(|_| "platform.ioError".to_string())?;
    atomic_write(&target, &bytes).map_err(|_| "platform.ioError".to_string())?;
    Ok(Some(file_name_of(&target)))
}

/// Proyecto nuevo: el siguiente "Guardar" pedirá ubicación.
#[tauri::command]
fn forget_project_file(files: State<'_, ProjectFiles>) -> Result<(), String> {
    *files.current.lock().map_err(|_| "platform.ioError")? = None;
    *files.pending.lock().map_err(|_| "platform.ioError")? = None;
    Ok(())
}

/// Solo se permite el origen propio de la aplicación (y el servidor local en desarrollo).
fn is_allowed_navigation(url: &Url) -> bool {
    let app_origin = matches!(url.scheme(), "tauri")
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"));
    let dev_origin = cfg!(debug_assertions)
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(5173);
    app_origin || dev_origin
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectFiles::default())
        .invoke_handler(tauri::generate_handler![
            open_project,
            accept_opened_project,
            save_project,
            save_export,
            forget_project_file
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("LCD Studio")
                .inner_size(1280.0, 820.0)
                .min_inner_size(360.0, 480.0)
                .on_navigation(is_allowed_navigation)
                .build()?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar LCD Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodifica_porcentajes() {
        assert_eq!(percent_decode("Mi%20pantalla%C3%B1").as_deref(), Some("Mi pantallañ"));
        assert_eq!(percent_decode("%ZZ"), None);
        assert_eq!(percent_decode("%4"), None);
    }

    #[test]
    fn sanea_nombres() {
        assert_eq!(sanitize_file_name("../../etc/passwd", "x"), "passwd");
        assert_eq!(sanitize_file_name("C:\\Windows\\a<b>.png", "x"), "ab.png");
        assert_eq!(sanitize_file_name("...", "x"), "x");
        assert_eq!(sanitize_file_name("", "def.json"), "def.json");
    }

    #[test]
    fn escritura_atomica_reemplaza_el_destino() {
        let dir = std::env::temp_dir().join(format!("lcd-studio-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("a.lcdstudio.json");
        atomic_write(&target, b"uno").unwrap();
        atomic_write(&target, b"dos").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"dos");
        let leftovers = fs::read_dir(&dir).unwrap().filter(|e| {
            e.as_ref().map(|e| e.file_name().to_string_lossy().ends_with(".tmp")).unwrap_or(false)
        });
        assert_eq!(leftovers.count(), 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn solo_permite_el_origen_propio() {
        assert!(is_allowed_navigation(&Url::parse("http://tauri.localhost/index.html").unwrap()));
        assert!(is_allowed_navigation(&Url::parse("tauri://localhost/").unwrap()));
        assert!(!is_allowed_navigation(&Url::parse("https://example.com/").unwrap()));
        assert!(!is_allowed_navigation(&Url::parse("http://tauri.localhost.evil.com/").unwrap()));
    }
}
