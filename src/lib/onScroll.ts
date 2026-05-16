/**
 * Subscribe to any user-perceptible scroll on the page.
 *
 * The `scroll` event in Tauri's WebKit can be flaky: AppShell pins body height
 * and makes <main> the scroller, and binding only to window or only to
 * document-with-capture has, in practice, not fired reliably for the actual
 * scroller. So we belt-and-suspenders:
 *
 *   1. Bind `scroll` on <main> directly when present.
 *   2. Bind `scroll` on document with capture (catches any other scrollable
 *      ancestor, e.g. drawer panels).
 *   3. Bind the *intent* events that always fire on the input device before
 *      the scroll is even computed — wheel, touchmove, and scroll-related
 *      keydowns. These bubble to window regardless of which element ends up
 *      actually scrolling, and let us dismiss in the same frame the user
 *      started scrolling rather than waiting for the layout to react.
 *
 * Targets that legitimately want to swallow scrolls (e.g. a popover with its
 * own overflow:auto) can opt out by carrying `data-scroll-trap`: any event
 * whose target sits inside such an element is ignored here, so the user can
 * scroll *within* the popover without dismissing it.
 *
 * Returns a teardown function that removes every listener it added.
 */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

export function onAnyScroll(handler: () => void): () => void {
  const insideTrap = (target: EventTarget | null): boolean => {
    const el = target as Element | null;
    return !!el && typeof el.closest === "function" && !!el.closest("[data-scroll-trap]");
  };
  const onEvent = (e: Event) => {
    if (insideTrap(e.target)) return;
    handler();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(e.key)) return;
    if (insideTrap(e.target)) return;
    handler();
  };

  const main = document.querySelector<HTMLElement>("main");
  if (main) main.addEventListener("scroll", onEvent, { passive: true });
  document.addEventListener("scroll", onEvent, {
    capture: true,
    passive: true,
  });
  window.addEventListener("wheel", onEvent, { passive: true });
  window.addEventListener("touchmove", onEvent, { passive: true });
  window.addEventListener("keydown", onKey);

  return () => {
    if (main) main.removeEventListener("scroll", onEvent);
    document.removeEventListener("scroll", onEvent, true);
    window.removeEventListener("wheel", onEvent);
    window.removeEventListener("touchmove", onEvent);
    window.removeEventListener("keydown", onKey);
  };
}
