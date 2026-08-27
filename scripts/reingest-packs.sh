#!/usr/bin/env bash
# Selective corpus pack reingest: scoped Swift ingest + pack split.
#
# Usage:
#   ./scripts/reingest-packs.sh --help
#   ./scripts/reingest-packs.sh --all
#   ./scripts/reingest-packs.sh commentaries interlinear
#   ./scripts/reingest-packs.sh audio-modern-en
#   npm run reingest -- commentaries anf
#
# No args → help (does not rebuild). --all rebuilds the monolith from scratch
# then splits every pack. Named packs merge into the existing Aletheia.sqlite
# via ingest --groups, then rewrite only those shards under data/packs/.
#
# audio-modern-en skips SQLite ingest and runs fetch-audio-pack.py instead.
# base / interlinear pull the heavy bible group — see data/packs/README.md.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

note() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
die() { printf "error: %s\n" "$*" >&2; exit 1; }

KNOWN_PACKS="base interlinear commentaries anf npnf reformers creeds audio-modern-en"

# Pack id → comma-separated aletheia-ingest --groups (empty = no SQLite ingest).
ingest_groups_for() {
    case "$1" in
        base) echo "bible,summa,creeds" ;;
        interlinear) echo "bible" ;;
        commentaries) echo "commentary" ;;
        anf) echo "anf" ;;
        npnf) echo "npnf" ;;
        reformers) echo "reformers" ;;
        creeds) echo "creeds" ;;
        audio-modern-en) echo "" ;;
        *) return 1 ;;
    esac
}

is_known_pack() {
    case " $KNOWN_PACKS " in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}

usage() {
    cat <<'EOF'
Reingest Aletheia corpus packs (scoped Swift ingest + pack split).

Usage:
  ./scripts/reingest-packs.sh --help
  ./scripts/reingest-packs.sh --all
  ./scripts/reingest-packs.sh <pack> [<pack> ...]
  npm run reingest -- <pack> ...
  npm run reingest:all

Options:
  -h, --help     Show this help and exit
  --all          Full rebuild: wipe/rebuild data/Aletheia.sqlite, then split every pack
  --pack-only    Skip Swift ingest; only re-split named packs from the existing monolith
                 (ignored with --all; audio-modern-en still runs fetch-audio-pack)

Packs:
  base              ingest --groups bible,summa,creeds  → data/packs/base.sqlite
                    (heavy: full Bible/lexicon/xref + Summa + Creeds)
  interlinear       ingest --groups bible               → data/packs/interlinear.sqlite
                    (heavy: re-runs bible stages for the word table)
  commentaries      ingest --groups commentary          → data/packs/commentaries.sqlite
  anf               ingest --groups anf                 → data/packs/anf.sqlite
  npnf              ingest --groups npnf                → data/packs/npnf.sqlite
  reformers         ingest --groups reformers           → data/packs/reformers.sqlite
  creeds            ingest --groups creeds              → rewrites data/packs/base.sqlite
                    (ThML label refresh only — no bible merge)
  audio-modern-en   fetch-audio-pack.py only            → data/packs/audio-modern-en/

Selective mode requires an existing data/Aletheia.sqlite (except audio-only).
Full --all does not download MP3s; run npm run fetch-audio-pack separately.
EOF
}

ALL=0
PACK_ONLY=0
PACKS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        --all)
            ALL=1
            shift
            ;;
        --pack-only)
            PACK_ONLY=1
            shift
            ;;
        -*)
            die "unknown option: $1 (try --help)"
            ;;
        *)
            if [[ -n "${PACKS}" ]]; then
                PACKS="${PACKS} $1"
            else
                PACKS="$1"
            fi
            shift
            ;;
    esac
done

if [[ "${ALL}" -eq 0 && -z "${PACKS}" ]]; then
    usage
    exit 0
fi

if [[ "${ALL}" -eq 1 && -n "${PACKS}" ]]; then
    die "pass either --all or named packs, not both"
fi

if [[ "${ALL}" -eq 0 ]]; then
    for p in ${PACKS}; do
        if ! is_known_pack "$p"; then
            die "unknown pack '$p' (known: ${KNOWN_PACKS})"
        fi
    done
fi

SOURCES="${ROOT_DIR}/data/sources"
SQLITE="${ROOT_DIR}/data/Aletheia.sqlite"
INGEST_DIR="${ROOT_DIR}/tools/ingest"

run_ingest() {
    local groups="${1:-}"
    [[ -d "${SOURCES}" ]] || die "missing data/sources — run ./scripts/fetch_sources.sh first"
    [[ -d "${INGEST_DIR}" ]] || die "missing tools/ingest"
    note "Swift ingest${groups:+ (--groups ${groups})}…"
    (
        cd "${INGEST_DIR}"
        if [[ -n "${groups}" ]]; then
            swift run -c release aletheia-ingest \
                --source-root "${SOURCES}" \
                --output "${SQLITE}" \
                --groups "${groups}"
        else
            swift run -c release aletheia-ingest \
                --source-root "${SOURCES}" \
                --output "${SQLITE}"
        fi
    )
}

run_split() {
    if [[ $# -eq 0 ]]; then
        note "Splitting all packs…"
        python3 scripts/split-corpus-packs.py --src "${SQLITE}" --out data/packs
    else
        note "Splitting packs: $*…"
        python3 scripts/split-corpus-packs.py --src "${SQLITE}" --out data/packs --packs "$@"
    fi
}

run_audio_fetch() {
    note "Fetching audio-modern-en MP3s…"
    python3 scripts/fetch-audio-pack.py
    # Refresh manifest / registry entry without touching SQLite shards.
    python3 scripts/split-corpus-packs.py --out data/packs --packs audio-modern-en
}

# Union ingest groups for named packs → comma-separated string.
union_groups() {
    local want_bible=0 want_commentary=0 want_summa=0
    local want_anf=0 want_npnf=0 want_reformers=0 want_creeds=0
    local p g
    for p in "$@"; do
        g="$(ingest_groups_for "$p")"
        case ",${g}," in
            *,bible,*) want_bible=1 ;;
        esac
        case ",${g}," in
            *,commentary,*) want_commentary=1 ;;
        esac
        case ",${g}," in
            *,summa,*) want_summa=1 ;;
        esac
        case ",${g}," in
            *,anf,*) want_anf=1 ;;
        esac
        case ",${g}," in
            *,npnf,*) want_npnf=1 ;;
        esac
        case ",${g}," in
            *,reformers,*) want_reformers=1 ;;
        esac
        case ",${g}," in
            *,creeds,*) want_creeds=1 ;;
        esac
    done
    local out=""
    [[ "${want_bible}" -eq 1 ]] && out="${out}${out:+,}bible"
    [[ "${want_commentary}" -eq 1 ]] && out="${out}${out:+,}commentary"
    [[ "${want_summa}" -eq 1 ]] && out="${out}${out:+,}summa"
    [[ "${want_anf}" -eq 1 ]] && out="${out}${out:+,}anf"
    [[ "${want_npnf}" -eq 1 ]] && out="${out}${out:+,}npnf"
    [[ "${want_reformers}" -eq 1 ]] && out="${out}${out:+,}reformers"
    [[ "${want_creeds}" -eq 1 ]] && out="${out}${out:+,}creeds"
    echo "${out}"
}

if [[ "${ALL}" -eq 1 ]]; then
    note "Full reingest (--all)"
    run_ingest ""
    run_split
    note "Done. Audio MP3s are separate: npm run fetch-audio-pack"
    exit 0
fi

# ── Selective ────────────────────────────────────────────────────────────────

SQLITE_PACKS=""
WANT_AUDIO=0
for p in ${PACKS}; do
    if [[ "${p}" == "audio-modern-en" ]]; then
        WANT_AUDIO=1
    else
        SQLITE_PACKS="${SQLITE_PACKS}${SQLITE_PACKS:+ }${p}"
    fi
done

if [[ -n "${SQLITE_PACKS}" ]]; then
    if [[ "${PACK_ONLY}" -eq 0 ]]; then
        [[ -f "${SQLITE}" ]] || die "selective ingest needs existing ${SQLITE} (or use --all)"
        # shellcheck disable=SC2086
        # Do not name this GROUPS — that is a readonly bash builtin (macOS /bin/bash 3.2).
        INGEST_GROUPS="$(union_groups ${SQLITE_PACKS})"
        if [[ -n "${INGEST_GROUPS}" ]]; then
            case ",${INGEST_GROUPS}," in
                *,bible,*)
                    note "Note: base/interlinear reingest runs the bible group (heavy merge into monolith)"
                    ;;
            esac
            run_ingest "${INGEST_GROUPS}"
        fi
    else
        [[ -f "${SQLITE}" ]] || die "--pack-only needs existing ${SQLITE}"
        note "Skipping Swift ingest (--pack-only)"
    fi
    # shellcheck disable=SC2086
    run_split ${SQLITE_PACKS}
fi

if [[ "${WANT_AUDIO}" -eq 1 ]]; then
    run_audio_fetch
fi

note "Done."
