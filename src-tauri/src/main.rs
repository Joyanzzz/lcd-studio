// Sin ventana de consola adicional en las compilaciones de lanzamiento.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lcd_studio_lib::run();
}
