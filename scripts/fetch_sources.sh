#!/usr/bin/env bash
# Fetches every raw source the ingest pipeline expects under data/sources/.
# Idempotent: re-running only refreshes things that already changed upstream.
# Required tools: git, curl, unzip.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/data/sources"
mkdir -p "${SRC_DIR}"

note() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }

# -----------------------------------------------------------------------------
# STEPBible TSV tables — CC BY 4.0
#   TAGOT  Greek LXX (incl. deuteros) with Strong's + morphology
#   TAHOT  Hebrew MT with Strong's + morphology
#   TAGNT  Greek NT, multi-base-text (NA28/THGNT/TR/Byz) tagged
#   TKJVS  KJV English with Strong's
# -----------------------------------------------------------------------------
STEP_DIR="${SRC_DIR}/stepbible"
if [[ ! -d "${STEP_DIR}/.git" ]]; then
    note "Cloning STEPBible-Data (shallow)…"
    git clone --depth=1 https://github.com/STEPBible/STEPBible-Data.git "${STEP_DIR}"
else
    note "Updating STEPBible-Data…"
    git -C "${STEP_DIR}" pull --ff-only
fi
# Flatten into the structure the pipeline expects (one subfolder per table).
for table in TAGOT TAHOT TAGNT TKJVS; do
    mkdir -p "${STEP_DIR}/${table}"
    find "${STEP_DIR}" -maxdepth 2 -type f -iname "${table}*.txt" -exec cp -f {} "${STEP_DIR}/${table}/" \;
done

# -----------------------------------------------------------------------------
# OpenScriptures HebrewLexicon (BDB + Strong's H) — CC BY 4.0
# -----------------------------------------------------------------------------
LEX_DIR="${SRC_DIR}/openscriptures"
mkdir -p "${LEX_DIR}"
if [[ ! -d "${LEX_DIR}/HebrewLexicon/.git" ]]; then
    note "Cloning openscriptures/HebrewLexicon…"
    git clone --depth=1 https://github.com/openscriptures/HebrewLexicon.git "${LEX_DIR}/HebrewLexicon"
fi
cp -f "${LEX_DIR}/HebrewLexicon/HebrewStrong.xml" "${LEX_DIR}/HebrewLexicon.xml" 2>/dev/null \
    || cp -f "${LEX_DIR}/HebrewLexicon/StrongHebrewG.xml" "${LEX_DIR}/HebrewLexicon.xml" 2>/dev/null \
    || true

# -----------------------------------------------------------------------------
# OpenScriptures Strongs (Greek) — public domain
# -----------------------------------------------------------------------------
if [[ ! -d "${LEX_DIR}/strongs/.git" ]]; then
    note "Cloning openscriptures/strongs…"
    git clone --depth=1 https://github.com/openscriptures/strongs.git "${LEX_DIR}/strongs"
fi
cp -f "${LEX_DIR}/strongs/greek/strongsgreek.xml" "${LEX_DIR}/StrongsGreek.xml" 2>/dev/null || true

# -----------------------------------------------------------------------------
# OpenBible.info cross-references — CC BY
# -----------------------------------------------------------------------------
XREF_DIR="${SRC_DIR}/openbibleinfo"
mkdir -p "${XREF_DIR}"
if [[ ! -f "${XREF_DIR}/cross_references.txt" ]]; then
    note "Downloading OpenBible.info cross-references…"
    curl -sSL https://a.openbible.info/data/cross-references.zip -o /tmp/obi.zip
    unzip -p /tmp/obi.zip cross_references.txt > "${XREF_DIR}/cross_references.txt"
    rm /tmp/obi.zip
fi

# -----------------------------------------------------------------------------
# BSB plain text — public domain (2023-04-30)
# -----------------------------------------------------------------------------
BSB_DIR="${SRC_DIR}/bsb"
mkdir -p "${BSB_DIR}"
if [[ ! -f "${BSB_DIR}/bsb.txt" ]]; then
    note "Downloading BSB plain text…"
    # Internet Archive mirror is more reliable than the .bible site.
    curl -sSL "https://bereanbible.com/bsb.txt" -o "${BSB_DIR}/bsb.txt" \
        || curl -sSL "https://archive.org/download/berean-standard-bible_202403/bsb.txt" -o "${BSB_DIR}/bsb.txt"
fi

# -----------------------------------------------------------------------------
# Brenton LXX English (eBible.org USFM)
# -----------------------------------------------------------------------------
note "Downloading Brenton LXX English USFM…"
BRENTON_DIR="${SRC_DIR}/brenton"
mkdir -p "${BRENTON_DIR}"
if [[ -z "$(ls -A "${BRENTON_DIR}" 2>/dev/null)" ]]; then
    curl -sSL "https://eBible.org/Scriptures/eng-Brenton_usfm.zip" -o /tmp/brenton.zip
    unzip -qoj /tmp/brenton.zip -d "${BRENTON_DIR}"
    rm /tmp/brenton.zip
fi

# -----------------------------------------------------------------------------
# KJV English + KJV 1611 Apocrypha (single eBible.org USFM zip)
# eng-kjv ships the full KJV with Apocrypha; we pull the whole archive then split.
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
# (mirror of dhspriory.org/thomas/). Each file is one Question with parallel
# Latin/English columns. Parser at tools/ingest/Sources/Ingest/Parsers/SummaLatinParser.swift
# pulls the left column.
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

# OpenGreekAndLatin / First1KGreek TEI XML
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
