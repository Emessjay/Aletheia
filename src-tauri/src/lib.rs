mod audio;
mod corpus_packs;

use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn corpus_db_path(app: AppHandle) -> Result<String, String> {
    let dest = corpus_packs::ensure_working_corpus(&app)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../../src/db/schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "per-side annotations",
            sql: include_str!("../../src/db/migrations/0002_per_side_annotations.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        },
    ));

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aletheia_user.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            corpus_db_path,
            corpus_packs::corpus_packs_status,
            corpus_packs::corpus_pack_install_from_path,
            audio::audio_source_path,
            audio::audio_book_sources_present,
            audio::audio_download_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
