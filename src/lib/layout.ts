/**
 * Shared vertical layout budget.
 *
 * The app footer was a fixed 10 rows — 42% of a standard 80x24 terminal — which starved
 * the dashboard and the sync panels of the space they needed. Its height is also part of
 * SyncPortal's available-height arithmetic, so both must read the same number.
 */

/**
 * Below this terminal height the footer sheds its branding and hint lines, and the
 * dashboard drops its LIFETIME panel. Chosen by measuring the real render: the status
 * box, status text and action buttons need ~21 rows, so anything under ~36 must shed
 * chrome or the action buttons fall off the bottom of the screen.
 */
export const COMPACT_HEIGHT_THRESHOLD = 36;

/** Under this height the splash is dropped entirely so the dashboard fits at 80x24. */
export const MIN_HEIGHT_FOR_SPLASH = 26;

const FOOTER_HEIGHT_FULL = 10;
const FOOTER_HEIGHT_COMPACT = 5;

export function isCompactHeight(terminalHeight: number): boolean {
    return terminalHeight < COMPACT_HEIGHT_THRESHOLD;
}

export function shouldShowSplash(terminalHeight: number): boolean {
    return terminalHeight >= MIN_HEIGHT_FOR_SPLASH;
}

export function appFooterHeight(terminalHeight: number): number {
    return isCompactHeight(terminalHeight) ? FOOTER_HEIGHT_COMPACT : FOOTER_HEIGHT_FULL;
}
