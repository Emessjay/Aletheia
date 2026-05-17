// Audio narration: on-demand chapter MP3 downloads.
//
// Files are stored under `<app_data_dir>/audio/<translation>/<book_slug>/<NNN>.mp3`
// — a flat, deterministic layout that the frontend manifest also assumes when
// it asks "is this chapter already downloaded?"
//
// All three Tauri commands here treat the on-disk store as authoritative. There
// is no SQLite tracking table; the file system *is* the index. That keeps the
// model self-healing: deleting the audio directory is a valid uninstall.

use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::io::AsyncWriteExt;

const AUDIO_SUBDIR: &str = "audio";

/// Validate the (translation, book_slug, chapter) triple to defend against
/// path traversal — the strings flow into a filesystem path.
fn validate(translation: &str, book_slug: &str, chapter: u32) -> Result<(), String> {
    if !matches!(translation, "en_bsb" | "en_kjv" | "en_web") {
        return Err(format!("unsupported translation: {translation}"));
    }
    if book_slug.is_empty() || book_slug.len() > 16 {
        return Err(format!("invalid book slug: {book_slug}"));
    }
    if !book_slug
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    {
        return Err(format!("book slug must be lowercase ascii: {book_slug}"));
    }
    if chapter == 0 || chapter > 200 {
        return Err(format!("chapter out of range: {chapter}"));
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

fn chapter_path<R: Runtime>(
    app: &AppHandle<R>,
    translation: &str,
    book_slug: &str,
    chapter: u32,
) -> Result<PathBuf, String> {
    Ok(book_dir(app, translation, book_slug)?.join(format!("{:03}.mp3", chapter)))
}

#[derive(Serialize)]
pub struct ChapterPath {
    /// Absolute filesystem path where this chapter lives (or would live).
    pub path: String,
    /// True if the file exists on disk and is non-empty.
    pub exists: bool,
}

/// Resolve the canonical local path for a (translation, book, chapter) and
/// report whether it's already downloaded. Returning the path even when the
/// file is missing lets the frontend pre-bind an `<audio>` element to the
/// future location.
#[tauri::command]
pub async fn audio_chapter_path<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
    chapter: u32,
) -> Result<ChapterPath, String> {
    validate(&translation, &book_slug, chapter)?;
    let p = chapter_path(&app, &translation, &book_slug, chapter)?;
    let exists = tokio::fs::metadata(&p)
        .await
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false);
    Ok(ChapterPath {
        path: p.to_string_lossy().into_owned(),
        exists,
    })
}

/// List the chapter numbers (1-indexed) already downloaded for this book.
/// Used by the player to render a "16 / 50 downloaded" progress label and
/// decide whether to offer the download-all button.
#[tauri::command]
pub async fn audio_book_downloaded<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
) -> Result<Vec<u32>, String> {
    if !matches!(translation.as_str(), "en_bsb" | "en_kjv" | "en_web") {
        return Err(format!("unsupported translation: {translation}"));
    }
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
        let name = name.to_string_lossy();
        // We only count <NNN>.mp3, and only if the file is non-empty so a
        // half-written download from a previous interrupted session doesn't
        // mask itself as "done".
        let Some(stem) = name.strip_suffix(".mp3") else {
            continue;
        };
        let Ok(n) = stem.parse::<u32>() else {
            continue;
        };
        if entry
            .metadata()
            .await
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
        {
            out.push(n);
        }
    }
    out.sort_unstable();
    Ok(out)
}

/// Download one chapter MP3 from `url` into the canonical local path. Writes
/// to a sibling `.part` file first and renames on success, so a cancelled or
/// failed download never leaves a truncated file masquerading as complete.
#[tauri::command]
pub async fn audio_download_chapter<R: Runtime>(
    app: AppHandle<R>,
    translation: String,
    book_slug: String,
    chapter: u32,
    url: String,
) -> Result<String, String> {
    validate(&translation, &book_slug, chapter)?;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refusing non-http(s) URL: {url}"));
    }

    let dest = chapter_path(&app, &translation, &book_slug, chapter)?;
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
