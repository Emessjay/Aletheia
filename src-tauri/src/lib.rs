mod audio;

use std::fs::{self, Metadata};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const CORPUS_FILENAME: &str = "Aletheia.sqlite";

/// Sidecar next to the user-data corpus copy that records the source
/// bundle's fingerprint at the time of the last copy. We compare against
/// this — not the dest file's own mtime — because the dest is opened by
/// SQLite at runtime and its mtime drifts forward via WAL checkpoints
/// during normal reads, which would mask a freshly re-ingested bundle and
/// leave the user reading stale corpus data forever.
const CORPUS_SIDECAR_SUFFIX: &str = ".source-fingerprint";

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

/// `<size>:<mtime_nanos>` — recopy when either changes. Size handles
/// "different bundle, same mtime" (rare but possible after a hard rebuild
/// that preserves filesystem timestamps); mtime handles "same size,
/// different content" (also rare given the bundle is hundreds of MB).
fn source_fingerprint(meta: &Metadata) -> String {
    let mtime_ns = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}:{}", meta.len(), mtime_ns)
}

fn sidecar_path(dest: &Path) -> PathBuf {
    let mut p = dest.as_os_str().to_owned();
    p.push(CORPUS_SIDECAR_SUFFIX);
    PathBuf::from(p)
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
    let sidecar = sidecar_path(&dest);

    let source_meta =
        fs::metadata(&source).map_err(|e| format!("bundled corpus missing: {e}"))?;
    let source_fp = source_fingerprint(&source_meta);

    let needs_copy = if !dest.exists() {
        true
    } else {
        // If the sidecar is missing or mismatched, the dest copy predates
        // this staleness mechanism (or the bundle has been re-ingested) —
        // either way, refresh.
        match fs::read_to_string(&sidecar) {
            Ok(stored) => stored.trim() != source_fp,
            Err(_) => true,
        }
    };

    if needs_copy {
        fs::copy(&source, &dest).map_err(|e| format!("copy corpus: {e}"))?;
        fs::write(&sidecar, &source_fp).map_err(|e| format!("write sidecar: {e}"))?;
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
