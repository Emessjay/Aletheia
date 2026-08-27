//! Audio narration for the desktop build.
//!
//! Resolution order for each source MP3:
//! 1. Prepackaged `audio-modern-en` pack under
//!    `<pack>/<translation>/<book_slug>/<filename>` (bundled resources or
//!    `<app_data>/packs/audio-modern-en/`). When found, the file is
//!    hard-linked (or copied) into the app-data audio cache so the
//!    `asset://` protocol scope (`$APPDATA/audio/**`) can play it.
//! 2. On-demand download cache at
//!    `<app_data>/audio/<translation>/<book_slug>/<filename>`.
//!
//! When the pack file is present, playback never hits the network. Web keeps
//! its own on-demand cache via `/api/audio/*`.
//!
//! One source MP3 may contain several "virtual" chapters (multi-chapter
//! LibriVox recordings); the player consults timing metadata to seek.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::io::AsyncWriteExt;

use crate::corpus_packs;

const AUDIO_SUBDIR: &str = "audio";
const AUDIO_PACK_ID: &str = "audio-modern-en";

fn validate_slug(s: &str, field: &str) -> Result<(), String> {
    if s.is_empty() || s.len() > 32 {
        return Err(format!("invalid {field}: {s}"));
    }
    if !s
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        return Err(format!(
            "{field} must be lowercase ascii + digits + underscore: {s}"
        ));
    }
    Ok(())
}

/// The filename comes from the upstream URL's basename. We allow a slightly
/// wider character set than the slugs (LibriVox filenames include hyphens,
/// parens, mixed case), but never anything that could escape the book
/// directory or shell-out via metacharacters.
fn validate_filename(s: &str) -> Result<(), String> {
    if s.is_empty() || s.len() > 128 {
        return Err(format!("invalid filename length: {s}"));
    }
    if s.contains('/') || s.contains('\\') || s.contains("..") {
        return Err(format!("filename contains path separators: {s}"));
    }
    if !s.bytes().all(|b| {
        b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'(' | b')')
    }) {
        return Err(format!("filename has disallowed characters: {s}"));
    }
    if !s.ends_with(".mp3") {
        return Err(format!("only .mp3 files are supported: {s}"));
    }
    Ok(())
}

fn validate_translation(t: &str) -> Result<(), String> {
    if !matches!(t, "en_bsb" | "en_kjv" | "en_web") {
        return Err(format!("unsupported translation: {t}"));
    }
    Ok(())
}

fn file_nonempty(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false)
}

fn cache_book_dir<R: Runtime>(
    app: &AppHandle<R>,
    translation: &str,
    book_slug: &str,
) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    Ok(base.join(AUDIO_SUBDIR).join(translation).join(book_slug))
}

fn cache_source_path<R: Runtime>(
    app: &AppHandle<R>,
    translation: &str,
    book_slug: &str,
    filename: &str,
) -> Result<PathBuf, String> {
    Ok(cache_book_dir(app, translation, book_slug)?.join(filename))
}

fn pack_file(
    pack_root: &Path,
    translation: &str,
    book_slug: &str,
    filename: &str,
) -> Option<PathBuf> {
    let p = pack_root.join(translation).join(book_slug).join(filename);
    if file_nonempty(&p) {
        Some(p)
    } else {
        None
    }
}

/// Materialize a pack MP3 into the app-data cache (hard link preferred, copy
/// fallback) so `asset://` under `$APPDATA/audio/**` can play it in both
/// `tauri dev` and release builds.
fn ensure_cache_from_pack(pack_path: &Path, cache_path: &Path) -> Result<(), String> {
    if file_nonempty(cache_path) {
        return Ok(());
    }
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    if let Err(e) = fs::hard_link(pack_path, cache_path) {
        fs::copy(pack_path, cache_path).map_err(|copy_err| {
            format!(
                "link {} → {} failed ({e}); copy also failed: {copy_err}",
                pack_path.display(),
                cache_path.display()
            )
        })?;
    }
    Ok(())
}

/// Prefer a prepackaged MP3 (linked into the download cache); otherwise the
/// cache path which may not exist yet.
fn resolve_source_path<R: Runtime>(
    app: &AppHandle<R>,
    translation: &str,
    book_slug: &str,
    filename: &str,
) -> Result<(PathBuf, bool), String> {
    let cache = cache_source_path(app, translation, book_slug, filename)?;
    if let Some(pack_root) = corpus_packs::locate_marker_pack(app, AUDIO_PACK_ID) {
        if let Some(pack_path) = pack_file(&pack_root, translation, book_slug, filename) {
            ensure_cache_from_pack(&pack_path, &cache)?;
            return Ok((cache, true));
        }
    }
    let exists = file_nonempty(&cache);
    Ok((cache, exists))
}

fn list_mp3s_in_dir(dir: &Path) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(format!("read_dir {}: {e}", dir.display())),
    };
    for entry in rd {
        let entry = entry.map_err(|e| format!("read_dir entry: {e}"))?;
        let name = entry.file_name();
        let name = name.to_string_lossy().to_string();
        if !name.ends_with(".mp3") {
            continue;
        }
        if entry
            .metadata()
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
        {
            out.push(name);
        }
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct SourcePath {
    /// Absolute filesystem path where this MP3 lives (or would live).
    pub path: String,
    /// True if the file exists on disk and is non-empty.
    pub exists: bool,
}

/// Resolve the local path for a source MP3 (pack first, then download cache).
/// Returning the path even when missing lets the frontend pre-compute the
/// asset-protocol URL for the cache location.
#[tauri::command]
pub async fn audio_source_path<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
    filename: String,
) -> Result<SourcePath, String> {
    validate_translation(&translation)?;
    validate_slug(&book_slug, "book_slug")?;
    validate_filename(&filename)?;
    let (p, exists) = resolve_source_path(&app, &translation, &book_slug, &filename)?;
    Ok(SourcePath {
        path: p.to_string_lossy().into_owned(),
        exists,
    })
}

/// List source MP3 filenames present for this book (pack ∪ download cache).
#[tauri::command]
pub async fn audio_book_sources_present<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
) -> Result<Vec<String>, String> {
    validate_translation(&translation)?;
    validate_slug(&book_slug, "book_slug")?;
    let mut names = BTreeSet::new();
    if let Some(pack_root) = corpus_packs::locate_marker_pack(&app, AUDIO_PACK_ID) {
        let pack_dir = pack_root.join(&translation).join(&book_slug);
        for name in list_mp3s_in_dir(&pack_dir)? {
            names.insert(name);
        }
    }
    let cache_dir = cache_book_dir(&app, &translation, &book_slug)?;
    for name in list_mp3s_in_dir(&cache_dir)? {
        names.insert(name);
    }
    Ok(names.into_iter().collect())
}

/// Ensure a source MP3 is available locally. If the audio pack already has
/// the file, materializes it into the app-data cache and returns that path
/// with no network I/O. Otherwise downloads into the cache (`.part` then rename).
#[tauri::command]
pub async fn audio_download_source<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
    url: String,
    filename: String,
) -> Result<String, String> {
    validate_translation(&translation)?;
    validate_slug(&book_slug, "book_slug")?;
    validate_filename(&filename)?;

    let (path, exists) = resolve_source_path(&app, &translation, &book_slug, &filename)?;
    if exists {
        return Ok(path.to_string_lossy().into_owned());
    }

    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refusing non-http(s) URL: {url}"));
    }

    let dest = cache_source_path(&app, &translation, &book_slug, &filename)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let part = dest.with_extension("mp3.part");

    let client = reqwest::Client::builder()
        .user_agent("Aletheia/0.1 (https://github.com/Emessjay/aletheia)")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GET {url}: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("GET {url} returned HTTP {status}"));
    }

    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("create {}: {e}", part.display()))?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("read chunk: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write chunk: {e}"))?;
    }
    file.flush()
        .await
        .map_err(|e| format!("flush: {e}"))?;
    drop(file);

    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| format!("rename {} -> {}: {e}", part.display(), dest.display()))?;

    Ok(dest.to_string_lossy().into_owned())
}
