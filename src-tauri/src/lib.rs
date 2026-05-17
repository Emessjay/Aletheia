mod audio;

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const CORPUS_FILENAME: &str = "Aletheia.sqlite";

/// Locate the bundled corpus.
///
/// In release builds it lives in the Tauri resource directory. In `tauri dev`
/// resources from tauri.conf.json are not copied next to the dev binary, so we
/// fall back to the source-tree path under `<repo>/data/`.
fn locate_corpus(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join(CORPUS_FILENAME);
        if p.exists() {
            return Ok(p);
        }
    }

    // Source-tree fallback for `tauri dev`. CARGO_MANIFEST_DIR is the src-tauri
    // directory at build time, so `../data/<file>` is the repo's data dir.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("data")
        .join(CORPUS_FILENAME);
    if dev.exists() {
        return Ok(dev);
    }

    Err(format!(
        "bundled corpus missing — looked in resource dir and {}",
        dev.display()
    ))
}

#[tauri::command]
fn corpus_db_path(app: AppHandle) -> Result<String, String> {
    let source = locate_corpus(&app)?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&app_data).map_err(|e| format!("mkdir app_data: {e}"))?;
    let dest: PathBuf = app_data.join(CORPUS_FILENAME);

    let needs_copy = match (fs::metadata(&dest), fs::metadata(&source)) {
        (Err(_), Ok(_)) => true,
        (Ok(dm), Ok(sm)) => match (sm.modified(), dm.modified()) {
            (Ok(st), Ok(dt)) => st > dt,
            _ => false,
        },
        (_, Err(e)) => return Err(format!("bundled corpus missing: {e}")),
    };

    if needs_copy {
        fs::copy(&source, &dest).map_err(|e| format!("copy corpus: {e}"))?;
    }

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
            audio::audio_source_path,
            audio::audio_book_sources_present,
            audio::audio_download_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
