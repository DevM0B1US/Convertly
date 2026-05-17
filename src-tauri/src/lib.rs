pub mod types;
pub mod metadata;
pub mod converter;
pub mod commands;
pub mod utils;

use commands::convert::ActiveConversions;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ActiveConversions {
            tasks: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::add_files,
            commands::convert::start_conversion,
            commands::convert::cancel_conversion,
            commands::convert::pause_conversion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
