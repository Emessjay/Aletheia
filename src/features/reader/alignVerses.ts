/**
 * After verses render inline in each column, this aligns matching verse
 * numbers across columns by inserting vertical space before any verse whose
 * start has drifted more than half a line out of sync with the same verse in
 * another column.
 *
 * Mechanism: each verse is preceded by a zero-size `<span data-spacer>`. To
 * push a verse down, we flip that spacer to `display: block` (forcing a line
 * break) and set its `height` to the measured gap. Because the spacer has
 * `line-height: 0`, the only vertical contribution is the explicit height, so
 * gaps are predictable.
 *
 * A drift threshold of half a line-height prevents minor wrapping differences
 * (a few pixels off) from triggering unnecessary line breaks. Verses with
 * small drift stay inline; only verses where the gap is big enough that the
 * break-overhead is "earned" get re-aligned.
 *
 * Verses are processed in order so each adjustment sees the cumulative effect
 * of earlier alignments. Verses unique to one column don't participate.
 */
export function alignVerses(container: HTMLElement | null) {
  if (!container) return;
  const cols = Array.from(
    container.querySelectorAll<HTMLElement>("[data-column]"),
  );
  if (cols.length < 2) return;

  // Reset prior alignment so a fresh measurement runs on the natural layout.
  for (const col of cols) {
    col.querySelectorAll<HTMLElement>("[data-spacer]").forEach((s) => {
      s.style.display = "";
      s.style.height = "";
    });
  }

  // Union of verse numbers present anywhere.
  const allVerses = new Set<number>();
  for (const col of cols) {
    col
      .querySelectorAll<HTMLElement>("[data-verse-anchor]")
      .forEach((el) => {
        const n = Number(el.dataset.verseAnchor);
        if (Number.isFinite(n)) allVerses.add(n);
      });
  }
  const verses = [...allVerses].sort((a, b) => a - b);

  // Use the tallest line-height across columns as the threshold reference —
  // the break-overhead is governed by whichever column's text is tallest.
  const lineHeights = cols.map((c) => {
    const lh = parseFloat(getComputedStyle(c).lineHeight);
    return Number.isFinite(lh) && lh > 0 ? lh : 24;
  });
  const referenceLineHeight = Math.max(...lineHeights);
  const alignThreshold = referenceLineHeight * 0.5;

  for (const n of verses) {
    const items: Array<{
      anchor: HTMLElement;
      col: HTMLElement;
      spacer: HTMLElement;
    }> = [];
    for (const col of cols) {
      const anchor = col.querySelector<HTMLElement>(
        `[data-verse-anchor="${n}"]`,
      );
      const spacer = col.querySelector<HTMLElement>(
        `[data-spacer="${n}"]`,
      );
      if (anchor && spacer) items.push({ anchor, col, spacer });
    }
    if (items.length < 2) continue;

    const topOf = (it: { anchor: HTMLElement; col: HTMLElement }) =>
      it.anchor.getBoundingClientRect().top -
      it.col.getBoundingClientRect().top;

    let tops = items.map(topOf);
    const maxTop = Math.max(...tops);
    const minTop = Math.min(...tops);

    // Drift smaller than ~half a line: leave the verses inline. The visual
    // misalignment is minor and forcing a break would actually move the
    // lagging column past the leader.
    if (maxTop - minTop < alignThreshold) continue;

    // Step 1: in lagging columns, flip the spacer to a block-level breaker
    // (zero height for now) so the verse starts on a fresh line. Some columns
    // may overshoot the original maxTop because the line break alone adds
    // line-height worth of space.
    const lagging: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (tops[i] < maxTop - 0.5) {
        items[i].spacer.style.display = "block";
        items[i].spacer.style.height = "0px";
        lagging.push(i);
      }
    }
    if (lagging.length === 0) continue;

    // Step 2: re-measure and fine-tune. Bring all lagging columns to the
    // tallest of their new positions so they line up with each other. The
    // unbroken leader stays inline; lagging columns may sit slightly below it
    // (the overshoot is bounded by referenceLineHeight).
    tops = items.map(topOf);
    const target = Math.max(...lagging.map((i) => tops[i]));
    for (const i of lagging) {
      const delta = target - tops[i];
      if (delta > 0.5) {
        items[i].spacer.style.height = `${delta}px`;
      }
    }
  }
}
