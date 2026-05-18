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

# CCEL ThML — Ante-Nicene Fathers + Nicene and Post-Nicene Fathers (Schaff
# PD editions). 37 volumes covering virtually every published patristic
# treatise; the ingest pipeline runs the ThMLParser's discoverWorks pass on
# each to enumerate individual works. ANF Vol 10 is a bibliographic stub
# (~67 KB) so we skip it. Total download ~155 MB.
fetch_ccel_volume() {
    local slug="$1"
    local label="$2"
    local out="${PAT_DIR}/${slug}.xml"
    if [[ ! -f "${out}" ]]; then
        note "Downloading ${label} (CCEL ThML)…"
        curl -sSL "https://ccel.org/ccel/schaff/${slug}.xml" -o "${out}"
    fi
}
for n in 01 02 03 04 05 06 07 08 09; do
    fetch_ccel_volume "anf${n}" "ANF Vol. ${n#0}"
done
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
    fetch_ccel_volume "npnf1${n}" "NPNF Series 1 Vol. ${n#0}"
done
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
    fetch_ccel_volume "npnf2${n}" "NPNF Series 2 Vol. ${n#0}"
done

# Schaff's Creeds of Christendom (1877-82, PD by age). Three volumes:
#   1 — History of Creeds
#   2 — Greek and Latin Creeds (Apostles, Nicene, Athanasian, Trent, etc.)
#   3 — Evangelical Protestant Creeds (Augsburg, Heidelberg, Belgic, Helvetic,
#       Westminster, 39 Articles, Canons of Dort, etc.)
# Vol 3 alone is the single canonical PD source for every major Protestant
# confession; bundling vols 1 and 2 adds the patristic/Roman creeds the
# Reformers were responding to plus Schaff's editorial framing.
fetch_ccel_volume "creeds1" "Schaff Creeds of Christendom, Vol. 1 (History)"
fetch_ccel_volume "creeds2" "Schaff Creeds of Christendom, Vol. 2 (Greek + Latin)"
fetch_ccel_volume "creeds3" "Schaff Creeds of Christendom, Vol. 3 (Protestant)"
# Schaff/CCEL filed every individual Protestant confession as a <div2> under
# four "Part" wrappers, which the ThMLParser treats as one work-row each.
# tools/schaff-creeds-fixup promotes them so Augsburg/Heidelberg/Belgic/
# Westminster/Dort/etc. show up as first-class works. Idempotent.
python3 "${ROOT_DIR}/tools/schaff-creeds-fixup/fixup.py" "${PAT_DIR}/creeds3.xml"

# Reformers — non-commentary works land in patristics/ alongside ANF/NPNF.
# CCEL ThML is acceptable here for the same reason it's acceptable for the
# Schaff editions: it's how the existing patristics pipeline is fed. The
# commentary tab (see below) deliberately avoids CCEL — Luther's biblical
# commentaries are sourced from Project Gutenberg plain text instead.
#
# Author-prefixed filenames avoid the Calvin/Luther `sermons.xml` collision
# without needing a per-author subdirectory.
fetch_ccel_authored() {
    local author="$1"   # 'luther' or 'calvin'
    local slug="$2"     # CCEL work slug
    local label="$3"
    local out="${PAT_DIR}/${author}_${slug}.xml"
    if [[ ! -f "${out}" ]]; then
        note "Downloading ${label} (CCEL ThML)…"
        curl -sSL "https://www.ccel.org/ccel/${author:0:1}/${author}/${slug}.xml" -o "${out}"
    fi
}
# Luther — bondage, table talk, the 95 theses + three primary works (which
# already subsume "Concerning Christian Liberty" via the Wace edition), the
# confessional/catechetical core, the Open Letter on Translating, and the
# Preface to Romans. Galatians + 1 & 2 Peter + Jude are commentaries and ship
# via the commentary tab from Project Gutenberg, not from CCEL.
fetch_ccel_authored "luther" "bondage"          "Luther — Bondage of the Will"
fetch_ccel_authored "luther" "tabletalk"        "Luther — Table Talk"
fetch_ccel_authored "luther" "first_prin"       "Luther — 95 Theses + Three Primary Works"
fetch_ccel_authored "luther" "smalcald"         "Luther — Smalcald Articles"
fetch_ccel_authored "luther" "smallcat"         "Luther — Small Catechism"
fetch_ccel_authored "luther" "largecatechism"   "Luther — Large Catechism"
fetch_ccel_authored "luther" "good_works"       "Luther — Treatise on Good Works"
fetch_ccel_authored "luther" "sermons"          "Luther — Assorted Sermons"
fetch_ccel_authored "luther" "translating"      "Luther — Open Letter on Translating"
# Preface to Romans is intentionally omitted: every div1 in the CCEL file is
# titled "Preface to..." / "Translator's Note" / "Title Page" / "Indexes",
# all of which ThMLParser's editorial-title filter strips, leaving no works.
# Calvin — Institutes (whole, not the prayer/Christian-life extracts which
# duplicate sections of Bk III), Sermons, Treatise on Relics. The biblical
# commentaries are already ingested via the SWORD CalvinCommentaries module.
fetch_ccel_authored "calvin" "institutes"       "Calvin — Institutes of the Christian Religion"
fetch_ccel_authored "calvin" "sermons"          "Calvin — Three Volumes of Sermons"
fetch_ccel_authored "calvin" "treatise_relics"  "Calvin — Treatise on Relics"
# Knox — three short standalone works plus vol 1 of his Laing-edited Works.
# Vols 2–6 of the Works are not on CCEL; if we ever want them they need a
# different source (Internet Archive scan + OCR cleanup).
fetch_ccel_authored "knox"   "blast"            "Knox — First Blast of the Trumpet"
fetch_ccel_authored "knox"   "history_reformation" "Knox — History of the Reformation in Scotland"
fetch_ccel_authored "knox"   "prayer"           "Knox — Treatise on Prayer"
fetch_ccel_authored "knox"   "works1"           "Knox — Works, Vol. 1"
# Latimer — Sermons (Parker Society edition, the single CCEL volume).
fetch_ccel_authored "latimer" "sermons"         "Latimer — Sermons"

# -----------------------------------------------------------------------------
# Bible commentaries — all PD-by-age, sourced from licensing-clean digital
# editions. See data/sources/COMMENTARIES.md for the licensing rationale and
# why CCEL's XML is deliberately avoided in favor of CC0 or SWORD redistributions.
# -----------------------------------------------------------------------------
COMM_DIR="${SRC_DIR}/commentaries"
mkdir -p "${COMM_DIR}"

# Matthew Henry's Complete Commentary on the Whole Bible (1708–1710).
# Source: lyteword/mhenry-complete on GitHub, CC0-1.0. Per-chapter markdown
# organized as <repo>/volume-N/<book-name>/chapter-N.md.
MH_DIR="${COMM_DIR}/matthew-henry"
if [[ ! -d "${MH_DIR}/.git" ]]; then
    note "Cloning Matthew Henry's Commentary (CC0)…"
    git clone --depth=1 https://github.com/lyteword/mhenry-complete.git "${MH_DIR}"
fi

# SWORD-format commentaries — Calvin, JFB, Wesley, Clarke. All declared
# "Public Domain" in their .conf files. We download each zip from
# crosswire.org and convert the binary module to a flat JSON file with
# tools/sword-extract/extract.py (uses pysword in a local venv).
SWORD_TMP="${SRC_DIR}/.sword-staging"
SWORD_VENV="${ROOT_DIR}/tools/sword-extract/.venv"

extract_sword_module() {
    local module="$1"  # e.g. JFB
    local out_basename="$2"  # e.g. jfb.json
    local json_out="${COMM_DIR}/${out_basename}"
    if [[ -f "${json_out}" ]]; then
        return 0
    fi
    note "Fetching SWORD module ${module}…"
    mkdir -p "${SWORD_TMP}/${module}"
    local zip_path="${SWORD_TMP}/${module}.zip"
    if [[ ! -f "${zip_path}" ]]; then
        curl -sSL "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/${module}.zip" \
            -o "${zip_path}"
    fi
    unzip -qo "${zip_path}" -d "${SWORD_TMP}/${module}"
    note "Extracting ${module} → ${out_basename}…"
    "${SWORD_VENV}/bin/python" "${ROOT_DIR}/tools/sword-extract/extract.py" \
        --module-dir "${SWORD_TMP}/${module}" \
        --module-name "${module}" \
        --out "${json_out}"
}

# Bootstrap the extraction venv on demand.
if [[ ! -x "${SWORD_VENV}/bin/python" ]]; then
    note "Setting up sword-extract venv…"
    python3 -m venv "${SWORD_VENV}"
    "${SWORD_VENV}/bin/pip" install --quiet -r "${ROOT_DIR}/tools/sword-extract/requirements.txt"
fi

extract_sword_module CalvinCommentaries calvin.json
extract_sword_module JFB jfb.json
extract_sword_module Wesley wesley.json
extract_sword_module Clarke clarke.json

# Luther's biblical commentaries — four PG eBooks merged into one verse-keyed
# luther.json by tools/luther-pg-extract. CCEL has these too but the commentary
# tab is held to a stricter source standard (see COMMENTARIES.md) so we route
# through Project Gutenberg instead.
LUTHER_PG_DIR="${SRC_DIR}/.pg-staging"
LUTHER_JSON="${COMM_DIR}/luther.json"
if [[ ! -f "${LUTHER_JSON}" ]]; then
    mkdir -p "${LUTHER_PG_DIR}"
    for pg in 1549 27978 29678 48193; do
        if [[ ! -f "${LUTHER_PG_DIR}/pg${pg}.txt" ]]; then
            note "Downloading PG #${pg} (Luther)…"
            curl -sSL "https://www.gutenberg.org/cache/epub/${pg}/pg${pg}.txt" \
                -o "${LUTHER_PG_DIR}/pg${pg}.txt"
        fi
    done
    note "Extracting Luther commentaries → luther.json…"
    python3 "${ROOT_DIR}/tools/luther-pg-extract/extract.py" \
        --input-dir "${LUTHER_PG_DIR}" \
        --out "${LUTHER_JSON}"
fi

note "Done. Next: \`cd tools/ingest && swift run aletheia-ingest -s ../../data/sources -o ../../data/Aletheia.sqlite\`"
