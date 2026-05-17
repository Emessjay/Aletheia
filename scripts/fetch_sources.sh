#!/usr/bin/env bash
# Fetches every raw source the ingest pipeline expects under data/sources/.
# Idempotent: re-running only refreshes things that already changed upstream.
# Required tools: git, curl, unzip.
#
# All biblical sources are public domain / unencumbered. See CLAUDE.md for the
# corpus licensing policy.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/data/sources"
mkdir -p "${SRC_DIR}"

note() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }

# -----------------------------------------------------------------------------
# BSB plain text — public domain (2023-04-30 dedication)
# -----------------------------------------------------------------------------
BSB_DIR="${SRC_DIR}/bsb"
mkdir -p "${BSB_DIR}"
if [[ ! -f "${BSB_DIR}/bsb.txt" ]]; then
    note "Downloading BSB plain text…"
    curl -sSL "https://bereanbible.com/bsb.txt" -o "${BSB_DIR}/bsb.txt" \
        || curl -sSL "https://archive.org/download/berean-standard-bible_202403/bsb.txt" -o "${BSB_DIR}/bsb.txt"
fi

# -----------------------------------------------------------------------------
# Brenton LXX English (eBible.org USFM) — public domain (1851)
# -----------------------------------------------------------------------------
BRENTON_DIR="${SRC_DIR}/brenton"
mkdir -p "${BRENTON_DIR}"
if [[ -z "$(ls -A "${BRENTON_DIR}" 2>/dev/null)" ]]; then
    note "Downloading Brenton LXX English USFM…"
    curl -sSL "https://eBible.org/Scriptures/eng-Brenton_usfm.zip" -o /tmp/brenton.zip
    unzip -qoj /tmp/brenton.zip -d "${BRENTON_DIR}"
    rm /tmp/brenton.zip
fi

# -----------------------------------------------------------------------------
# Brenton LXX Greek (eBible.org grcbrent USFM) — public domain (1851)
# -----------------------------------------------------------------------------
GRCBRENT_DIR="${SRC_DIR}/grcbrent"
mkdir -p "${GRCBRENT_DIR}"
if [[ -z "$(ls -A "${GRCBRENT_DIR}" 2>/dev/null)" ]]; then
    note "Downloading Brenton Greek LXX (grcbrent) USFM…"
    curl -sSL "https://eBible.org/Scriptures/grcbrent_usfm.zip" -o /tmp/grcbrent.zip
    unzip -qoj /tmp/grcbrent.zip -d "${GRCBRENT_DIR}"
    rm /tmp/grcbrent.zip
fi

# -----------------------------------------------------------------------------
# World English Bible w/ Apocrypha (eBible.org eng-webbe USFM) — public domain
# (Rainbow Missions PD dedication). Used as the modern-English side for the
# deuterocanon; ships proto + deutero in one flat directory and the USFM parser
# routes by \id code.
# -----------------------------------------------------------------------------
WEB_DIR="${SRC_DIR}/web"
mkdir -p "${WEB_DIR}"
if [[ -z "$(ls -A "${WEB_DIR}" 2>/dev/null)" ]]; then
    note "Downloading WEB (with Apocrypha) USFM…"
    curl -sSL "https://eBible.org/Scriptures/eng-webbe_usfm.zip" -o /tmp/web.zip
    unzip -qoj /tmp/web.zip -d "${WEB_DIR}"
    rm /tmp/web.zip
fi

# -----------------------------------------------------------------------------
# KJV English + KJV 1611 Apocrypha (eBible.org USFM) — public domain by age
# -----------------------------------------------------------------------------
note "Downloading KJV (with Apocrypha) USFM…"
KJV_DIR="${SRC_DIR}/kjv"
APOC_DIR="${SRC_DIR}/kjv-apocrypha"
mkdir -p "${KJV_DIR}" "${APOC_DIR}"
if [[ -z "$(ls -A "${KJV_DIR}" 2>/dev/null)" ]]; then
    curl -sSL "https://eBible.org/Scriptures/eng-kjv_usfm.zip" -o /tmp/kjv.zip
    rm -rf /tmp/kjv-extract
    unzip -qo /tmp/kjv.zip -d /tmp/kjv-extract
    # Protocanonical books → kjv/; deuterocanonical (Apocrypha) → kjv-apocrypha/
    DEUTERO_CODES="TOB JDT ESG WIS SIR BAR LJE S3Y SUS BEL 1MA 2MA 1ES 2ES MAN"
    for f in /tmp/kjv-extract/*.usfm /tmp/kjv-extract/*.sfm; do
        [[ -f "$f" ]] || continue
        base="$(basename "$f")"
        is_deutero=false
        for d in $DEUTERO_CODES; do
            if [[ "$base" == *"$d"* ]]; then is_deutero=true; break; fi
        done
        if $is_deutero; then
            cp -f "$f" "${APOC_DIR}/"
        else
            cp -f "$f" "${KJV_DIR}/"
        fi
    done
    rm -rf /tmp/kjv.zip /tmp/kjv-extract
fi

# -----------------------------------------------------------------------------
# Byzantine Majority Greek NT (byztxt/byzantine-majority-text) — Unlicense / PD
# Robinson-Pierpont 2018, tagged with Strong's + morphology
# -----------------------------------------------------------------------------
BYZ_DIR="${SRC_DIR}/byztxt"
if [[ ! -d "${BYZ_DIR}/.git" ]]; then
    note "Cloning byztxt/byzantine-majority-text (shallow)…"
    git clone --depth=1 https://github.com/byztxt/byzantine-majority-text.git "${BYZ_DIR}"
else
    note "Updating byztxt/byzantine-majority-text…"
    git -C "${BYZ_DIR}" pull --ff-only
fi

# -----------------------------------------------------------------------------
# BDB Hebrew lexicon (eliranwong/unabridged-BDB-Hebrew-lexicon) — PD
# Unabridged 1906 BDB, Strong's-keyed, distributed as JSON.
# -----------------------------------------------------------------------------
BDB_DIR="${SRC_DIR}/bdb"
mkdir -p "${BDB_DIR}"
if [[ ! -f "${BDB_DIR}/DictBDB.json" ]]; then
    note "Downloading unabridged BDB JSON…"
    curl -sSL "https://raw.githubusercontent.com/eliranwong/unabridged-BDB-Hebrew-lexicon/master/DictBDB.json" \
        -o "${BDB_DIR}/DictBDB.json"
fi

# -----------------------------------------------------------------------------
# Strong's Greek dictionary — PD by age (Strong, 1890)
# We use the openscriptures/strongs digital edition for convenience; the digital
# edition itself is unlicensed in that repo, but the underlying lexicon is PD.
# -----------------------------------------------------------------------------
STRONGS_DIR="${SRC_DIR}/strongs-greek"
mkdir -p "${STRONGS_DIR}"
if [[ ! -f "${STRONGS_DIR}/StrongsGreek.xml" ]]; then
    note "Downloading Strong's Greek dictionary…"
    curl -sSL "https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4/strongsgreek.xml" \
        -o "${STRONGS_DIR}/StrongsGreek.xml"
fi

# -----------------------------------------------------------------------------
# Treasury of Scripture Knowledge (TSK) cross-references — PD by age (R.A. Torrey, 1880s)
# Sourced from narthur/tsk-cli; the repository's GPL applies to the CLI code,
# not to the underlying public-domain TSK data file.
# -----------------------------------------------------------------------------
TSK_DIR="${SRC_DIR}/tsk"
mkdir -p "${TSK_DIR}"
if [[ ! -f "${TSK_DIR}/tskxref.txt" ]]; then
    note "Downloading Treasury of Scripture Knowledge data…"
    curl -sSL "https://raw.githubusercontent.com/narthur/tsk-cli/master/tskxref.txt" \
        -o "${TSK_DIR}/tskxref.txt"
fi

# -----------------------------------------------------------------------------
# Patristics
# -----------------------------------------------------------------------------
PAT_DIR="${SRC_DIR}/patristics"
mkdir -p "${PAT_DIR}"

# Jacob-Gray/summa.json — Unlicense (PD)
if [[ ! -f "${PAT_DIR}/summa.json" ]]; then
    note "Downloading summa.json…"
    curl -sSL "https://raw.githubusercontent.com/Jacob-Gray/summa.json/master/summa.json" \
        -o "${PAT_DIR}/summa.json"
fi

# Summa Theologica Latin — bilingual HTML files from Geremia/AquinasOperaOmnia
# (mirror of dhspriory.org/thomas/). See CLAUDE.md re: licensing concerns;
# kept for now but a clean replacement source is still TBD.
SUMMA_LAT_DIR="${SRC_DIR}/summa-latin"
if [[ ! -d "${SUMMA_LAT_DIR}/.git" ]]; then
    note "Cloning Geremia/AquinasOperaOmnia for the Latin Summa…"
    git clone --depth=1 https://github.com/Geremia/AquinasOperaOmnia.git "${SUMMA_LAT_DIR}" || true
fi

# CCEL ThML — Trypho (English) and Athanasius On the Incarnation (English)
if [[ ! -f "${PAT_DIR}/trypho-en.xml" ]]; then
    note "Downloading Dialogue with Trypho (CCEL ThML)…"
    curl -sSL "https://ccel.org/ccel/schaff/anf01.xml" -o "${PAT_DIR}/anf01.xml" || true
    # The ThML parser handles the full ANF01 volume; we extract Trypho by div ID at ingest time.
    cp -f "${PAT_DIR}/anf01.xml" "${PAT_DIR}/trypho-en.xml" 2>/dev/null || true
fi

if [[ ! -f "${PAT_DIR}/incarnation-en.xml" ]]; then
    note "Downloading On the Incarnation (CCEL ThML)…"
    curl -sSL "https://ccel.org/ccel/schaff/npnf204.xml" -o "${PAT_DIR}/incarnation-en.xml" || true
fi

# OpenGreekAndLatin / First1KGreek TEI XML — CC BY-SA 4.0 (viral SA, see CLAUDE.md).
# Currently used only for Greek patristics, not biblical content. Reviewing.
OGL_DIR="${SRC_DIR}/opengreekandlatin"
if [[ ! -d "${OGL_DIR}/.git" ]]; then
    note "Cloning First1KGreek (shallow; this is large)…"
    git clone --depth=1 https://github.com/OpenGreekAndLatin/First1KGreek.git "${OGL_DIR}" || true
fi
# Justin Martyr (TLG 0645) — Dialogue with Trypho is .tlg003
find "${OGL_DIR}" -path "*tlg0645/tlg003*" -name "*grc*.xml" -exec cp {} "${PAT_DIR}/trypho-gr.xml" \; 2>/dev/null
# Athanasius (TLG 2035) — De Incarnatione Verbi is .tlg002
find "${OGL_DIR}" -path "*tlg2035/tlg002*" -name "*grc*.xml" -exec cp {} "${PAT_DIR}/incarnation-gr.xml" \; 2>/dev/null

note "Done. Next: \`cd tools/ingest && swift run aletheia-ingest -s ../../data/sources -o ../../data/Aletheia.sqlite\`"
