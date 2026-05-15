use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const CORPUS_FILENAME: &str = "Aletheia.sqlite";

#[tauri::command]
fn corpus_db_path(app: AppHandle) -> Result<String, String> {
    let resource = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?
        .join(CORPUS_FILENAME);

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&app_data).map_err(|e| format!("mkdir app_data: {e}"))?;
    let dest: PathBuf = app_data.join(CORPUS_FILENAME);

    let needs_copy = match (fs::metadata(&dest), fs::metadata(&resource)) {
        (Err(_), Ok(_)) => true,
        (Ok(dm), Ok(rm)) => match (rm.modified(), dm.modified()) {
            (Ok(rt), Ok(dt)) => rt > dt,
            _ => false,
        },
        (_, Err(e)) => return Err(format!("bundled corpus missing: {e}")),
    };

    if needs_copy {
        fs::copy(&resource, &dest).map_err(|e| format!("copy corpus: {e}"))?;
    }

    Ok(dest.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../../src/db/schema.sql"),
        kind: MigrationKind::Up,
    }];

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }));
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aletheia_user.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![corpus_db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
