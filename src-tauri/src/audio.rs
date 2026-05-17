// Audio narration: on-demand source-MP3 downloads.
//
// Files are stored under `<app_data_dir>/audio/<translation>/<book_slug>/<filename>`,
// where `<filename>` is the basename of the upstream URL (e.g.
// "BSB_01_Gen_001.mp3" or "gospeljohn_2_kjv.mp3"). One source MP3 may
// contain several "virtual" chapters (multi-chapter LibriVox recordings);
// the runtime player consults a timing manifest to seek into the right
// segment, so we only download each upstream file once per book.
//
// All three commands treat the filesystem as authoritative — there is no
// SQLite tracking table. Deleting the audio directory is a valid uninstall.

use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::io::AsyncWriteExt;

const AUDIO_SUBDIR: &str = "audio";

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

fn book_dir<R: Runtime>(
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

fn source_path<R: Runtime>(
    app: &AppHandle<R>,
    translation: &str,
    book_slug: &str,
    filename: &str,
) -> Result<PathBuf, String> {
    Ok(book_dir(app, translation, book_slug)?.join(filename))
}

#[derive(Serialize)]
pub struct SourcePath {
    /// Absolute filesystem path where this MP3 lives (or would live).
    pub path: String,
    /// True if the file exists on disk and is non-empty.
    pub exists: bool,
}

/// Resolve the canonical local path for an upstream source MP3 and report
/// whether it's already downloaded. Returning the path even when the file
/// is missing lets the frontend pre-compute the asset-protocol URL.
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
    let p = source_path(&app, &translation, &book_slug, &filename)?;
    let exists = tokio::fs::metadata(&p)
        .await
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false);
    Ok(SourcePath {
        path: p.to_string_lossy().into_owned(),
        exists,
    })
}

/// List the source MP3 filenames already present for this book — used by
/// the player to render a "16 / 22 chapters downloaded" indicator (the
/// frontend combines this with its manifest to map filenames → chapters).
#[tauri::command]
pub async fn audio_book_sources_present<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
) -> Result<Vec<String>, String> {
    validate_translation(&translation)?;
    validate_slug(&book_slug, "book_slug")?;
    let dir = book_dir(&app, &translation, &book_slug)?;
    let mut out = Vec::new();
    let mut rd = match tokio::fs::read_dir(&dir).await {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(format!("read_dir {}: {e}", dir.display())),
    };
    while let Some(entry) = rd
        .next_entry()
        .await
        .map_err(|e| format!("read_dir entry: {e}"))?
    {
        let name = entry.file_name();
        let name = name.to_string_lossy().to_string();
        if !name.ends_with(".mp3") {
            continue;
        }
        // Half-written downloads from a previous interrupted session land as
        // `.part` files, which already fail the extension check above; the
        // empty-file guard catches any other zero-byte stragglers.
        if entry
            .metadata()
            .await
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
        {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

/// Download a source MP3 from `url` into the canonical local path. Writes to
/// a sibling `.part` file first and renames on success.
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
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refusing non-http(s) URL: {url}"));
    }

    let dest = source_path(&app, &translation, &book_slug, &filename)?;
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
