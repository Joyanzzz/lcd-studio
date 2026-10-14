fn main() {
    // Los comandos propios solo se pueden invocar si una "capability" los permite
    // explícitamente (src-tauri/capabilities/default.json).
    let manifest = tauri_build::AppManifest::new().commands(&[
        "open_project",
        "accept_opened_project",
        "save_project",
        "save_export",
        "forget_project_file",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("error al preparar la compilación de Tauri");
}
