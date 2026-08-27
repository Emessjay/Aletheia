//! Optional corpus content packs for the desktop build.
//!
//! The lean base SQLite ships with Bibles + Strong's lexicon + Summa/Creeds.
//! Optional shards (interlinear word table, commentaries, ANF, NPNF, reformers)
//! live beside it and are merged into the working app-data copy on launch.
//! Audio (Modern English) is a marker pack — MP3s remain on-demand downloads.
//!
//! Dev/test builds bundle every pack under `data/packs/`. Production installers
//! should ship only `base.sqlite`; downloaded packs land in
//! `<app_data>/packs/`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub const BASE_FILENAME: &str = "base.sqlite";
pub const LEGACY_FILENAME: &str = "Aletheia.sqlite";
pub const PACKS_SUBDIR: &str = "packs";
const WORKING_FILENAME: &str = "Aletheia.sqlite";
const WORKING_SIDECAR: &str = ".packs-fingerprint";

/// SQLite content packs that merge into the working corpus.
pub const SQLITE_PACK_IDS: &[&str] = &[
    "interlinear",
    "commentaries",
    "anf",
    "npnf",
    "reformers",
];

/// Marker pack (directory with manifest.json) — no SQLite merge.
pub const MARKER_PACK_IDS: &[&str] = &["audio-modern-en"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackStatus {
    pub id: String,
    pub installed: bool,
    pub path: Option<String>,
    pub bytes: Option<u64>,
    /// "sqlite" | "marker" | "base"
    pub kind: String,
}

fn source_fingerprint(meta: &std::fs::Metadata) -> String {
    let mtime_ns = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}:{}", meta.len(), mtime_ns)
}

/// Repo `data/` (dev) or resource dir (release).
fn data_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        roots.push(dir.clone());
        // Bundled layout: resources may be flat or under packs/
        roots.push(dir.join(PACKS_SUBDIR));
    }
    let dev_data = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("data");
    roots.push(dev_data.clone());
    roots.push(dev_data.join(PACKS_SUBDIR));
    roots
}

fn find_in_roots(roots: &[PathBuf], relative: &str) -> Option<PathBuf> {
    for root in roots {
        let p = root.join(relative);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Locate base corpus: prefer pack-mode `base.sqlite`, else legacy monolith.
pub fn locate_base(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    let roots = data_roots(app);
    if let Some(p) = find_in_roots(&roots, BASE_FILENAME) {
        return Ok((p, true /* pack mode */));
    }
    // Also accept data/packs/base.sqlite via roots that already include packs/
    if let Some(p) = find_in_roots(&roots, &format!("{PACKS_SUBDIR}/{BASE_FILENAME}")) {
        return Ok((p, true));
    }
    if let Some(p) = find_in_roots(&roots, LEGACY_FILENAME) {
        return Ok((p, false));
    }
    Err(format!(
        "bundled corpus missing — looked for {BASE_FILENAME} / {LEGACY_FILENAME} under {:?}",
        roots
    ))
}

fn locate_sqlite_pack(app: &AppHandle, pack_id: &str) -> Option<PathBuf> {
    let name = format!("{pack_id}.sqlite");
    let roots = data_roots(app);
    // Prefer user-installed packs in app_data.
    if let Ok(app_data) = app.path().app_data_dir() {
        let user = app_data.join(PACKS_SUBDIR).join(&name);
        if user.exists() {
            return Some(user);
        }
    }
    find_in_roots(&roots, &name)
        .or_else(|| find_in_roots(&roots, &format!("{PACKS_SUBDIR}/{name}")))
}

fn locate_marker_pack(app: &AppHandle, pack_id: &str) -> Option<PathBuf> {
    let roots = data_roots(app);
    if let Ok(app_data) = app.path().app_data_dir() {
        let user = app_data.join(PACKS_SUBDIR).join(pack_id).join("manifest.json");
        if user.exists() {
            return Some(user.parent().unwrap().to_path_buf());
        }
    }
    find_in_roots(&roots, &format!("{pack_id}/manifest.json"))
        .or_else(|| find_in_roots(&roots, &format!("{PACKS_SUBDIR}/{pack_id}/manifest.json")))
        .map(|p| p.parent().unwrap().to_path_buf())
}

fn dir_size(path: &Path) -> u64 {
    walkdir_size(path).unwrap_or(0)
}

fn walkdir_size(path: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    if path.is_file() {
        return Ok(path.metadata()?.len());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_file() {
            total += meta.len();
        } else if meta.is_dir() {
            total += walkdir_size(&entry.path())?;
        }
    }
    Ok(total)
}

/// Fingerprint of base + every installed pack source (drives recopy/merge).
fn installed_fingerprint(app: &AppHandle, base: &Path, pack_mode: bool) -> Result<String, String> {
    let mut parts = Vec::new();
    let base_meta = fs::metadata(base).map_err(|e| format!("base meta: {e}"))?;
    parts.push(format!("base={}", source_fingerprint(&base_meta)));
    if pack_mode {
        for id in SQLITE_PACK_IDS {
            if let Some(p) = locate_sqlite_pack(app, id) {
                let m = fs::metadata(&p).map_err(|e| format!("{id} meta: {e}"))?;
                parts.push(format!("{id}={}", source_fingerprint(&m)));
            }
        }
        for id in MARKER_PACK_IDS {
            if let Some(p) = locate_marker_pack(app, id) {
                let man = p.join("manifest.json");
                if let Ok(m) = fs::metadata(&man) {
                    parts.push(format!("{id}={}", source_fingerprint(&m)));
                }
            }
        }
    } else {
        parts.push("legacy=1".into());
    }
    Ok(parts.join("|"))
}

fn run_sqlite_sql(db: &Path, sql: &str) -> Result<(), String> {
    let mut child = Command::new("sqlite3")
        .arg(db)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "failed to spawn sqlite3 (required to merge corpus packs): {e}"
            )
        })?;
    {
        let mut stdin = child.stdin.take().expect("stdin");
        stdin
            .write_all(sql.as_bytes())
            .map_err(|e| format!("sqlite3 stdin: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("sqlite3 wait: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sqlite3 failed: {err}"));
    }
    Ok(())
}

fn merge_sqlite_pack(working: &Path, pack_path: &Path, pack_id: &str) -> Result<(), String> {
    // Escape single quotes in path for SQL string literal.
    let pack_sql = pack_path.to_string_lossy().replace('\'', "''");
    let sql = match pack_id {
        "interlinear" => format!(
            r#"
PRAGMA foreign_keys=OFF;
ATTACH DATABASE '{pack_sql}' AS pack;
INSERT OR IGNORE INTO word SELECT * FROM pack.word;
DETACH DATABASE pack;
"#
        ),
        _ => format!(
            r#"
PRAGMA foreign_keys=OFF;
ATTACH DATABASE '{pack_sql}' AS pack;
INSERT OR IGNORE INTO work SELECT * FROM pack.work;
INSERT OR IGNORE INTO section SELECT * FROM pack.section;
DETACH DATABASE pack;
"#
        ),
    };
    run_sqlite_sql(working, &sql)
}

/// Ensure the working corpus in app_data reflects base + installed packs.
pub fn ensure_working_corpus(app: &AppHandle) -> Result<PathBuf, String> {
    let (base, pack_mode) = locate_base(app)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&app_data).map_err(|e| format!("mkdir app_data: {e}"))?;
    let dest = app_data.join(WORKING_FILENAME);
    let sidecar = app_data.join(format!("{WORKING_FILENAME}{WORKING_SIDECAR}"));

    let fp = installed_fingerprint(app, &base, pack_mode)?;
    let needs_rebuild = match fs::read_to_string(&sidecar) {
        Ok(stored) => stored.trim() != fp,
        Err(_) => true,
    } || !dest.exists();

    if needs_rebuild {
        fs::copy(&base, &dest).map_err(|e| format!("copy base corpus: {e}"))?;
        if pack_mode {
            for id in SQLITE_PACK_IDS {
                if let Some(p) = locate_sqlite_pack(app, id) {
                    merge_sqlite_pack(&dest, &p, id)?;
                }
            }
        }
        fs::write(&sidecar, &fp).map_err(|e| format!("write packs sidecar: {e}"))?;
    }

    Ok(dest)
}

#[tauri::command]
pub fn corpus_packs_status(app: AppHandle) -> Result<Vec<PackStatus>, String> {
    let (base, pack_mode) = locate_base(&app)?;
    let mut out = Vec::new();

    let base_meta = fs::metadata(&base).ok();
    out.push(PackStatus {
        id: "base".into(),
        installed: true,
        path: Some(base.to_string_lossy().into_owned()),
        bytes: base_meta.as_ref().map(|m| m.len()),
        kind: "base".into(),
    });

    if !pack_mode {
        // Legacy monolith: report every optional pack as installed.
        for id in SQLITE_PACK_IDS {
            out.push(PackStatus {
                id: (*id).into(),
                installed: true,
                path: Some(base.to_string_lossy().into_owned()),
                bytes: None,
                kind: "sqlite".into(),
            });
        }
        for id in MARKER_PACK_IDS {
            out.push(PackStatus {
                id: (*id).into(),
                installed: true,
                path: None,
                bytes: None,
                kind: "marker".into(),
            });
        }
        return Ok(out);
    }

    for id in SQLITE_PACK_IDS {
        match locate_sqlite_pack(&app, id) {
            Some(p) => {
                let bytes = fs::metadata(&p).ok().map(|m| m.len());
                out.push(PackStatus {
                    id: (*id).into(),
                    installed: true,
                    path: Some(p.to_string_lossy().into_owned()),
                    bytes,
                    kind: "sqlite".into(),
                });
            }
            None => out.push(PackStatus {
                id: (*id).into(),
                installed: false,
                path: None,
                bytes: None,
                kind: "sqlite".into(),
            }),
        }
    }

    for id in MARKER_PACK_IDS {
        match locate_marker_pack(&app, id) {
            Some(p) => out.push(PackStatus {
                id: (*id).into(),
                installed: true,
                path: Some(p.to_string_lossy().into_owned()),
                bytes: Some(dir_size(&p)),
                kind: "marker".into(),
            }),
            None => out.push(PackStatus {
                id: (*id).into(),
                installed: false,
                path: None,
                bytes: None,
                kind: "marker".into(),
            }),
        }
    }

    Ok(out)
}

/// Install a pack from an absolute filesystem path (dev / future download staging).
#[tauri::command]
pub fn corpus_pack_install_from_path(
    app: AppHandle,
    pack_id: String,
    source_path: String,
) -> Result<PackStatus, String> {
    if !SQLITE_PACK_IDS.contains(&pack_id.as_str()) && !MARKER_PACK_IDS.contains(&pack_id.as_str())
    {
        return Err(format!("unknown pack id: {pack_id}"));
    }
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(format!("source missing: {source_path}"));
    }
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let packs_dir = app_data.join(PACKS_SUBDIR);
    fs::create_dir_all(&packs_dir).map_err(|e| format!("mkdir packs: {e}"))?;

    if MARKER_PACK_IDS.contains(&pack_id.as_str()) {
        let dest = packs_dir.join(&pack_id);
        if dest.exists() {
            fs::remove_dir_all(&dest).map_err(|e| format!("rm old marker: {e}"))?;
        }
        copy_dir(&src, &dest)?;
    } else {
        let dest = packs_dir.join(format!("{pack_id}.sqlite"));
        fs::copy(&src, &dest).map_err(|e| format!("copy pack: {e}"))?;
    }

    // Invalidate working corpus so next open remerges.
    let sidecar = app_data.join(format!("{WORKING_FILENAME}{WORKING_SIDECAR}"));
    let _ = fs::remove_file(&sidecar);

    let statuses = corpus_packs_status(app)?;
    statuses
        .into_iter()
        .find(|s| s.id == pack_id)
        .ok_or_else(|| format!("pack {pack_id} missing after install"))
}

fn copy_dir(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("mkdir: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("read_dir: {e}"))? {
        let entry = entry.map_err(|e| format!("entry: {e}"))?;
        let ty = entry.file_type().map_err(|e| format!("file_type: {e}"))?;
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to).map_err(|e| format!("copy file: {e}"))?;
        }
    }
    Ok(())
}
