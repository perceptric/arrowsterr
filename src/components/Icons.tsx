// The app's line icons, in place of text symbols and emoji (docs/unify-plan.md, Part 1.8). Same drawing as the
// view icons in research/shared.tsx: a 24px grid, a 1.8 stroke in the text colour, 16px by default.
// Icons are decorative (aria-hidden); the button or link around one carries its label.

type P = { size?: number; className?: string };

const icon = (d: React.ReactNode, { size = 16, className }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    {d}
  </svg>
);

/** → a link or step forward */
export const ArrowRight = (p: P = {}) => icon(<path d="M5 12h14M13 6l6 6-6 6" />, p);
/** ← back */
export const ArrowLeft = (p: P = {}) => icon(<path d="M19 12H5M11 6l-6 6 6 6" />, p);
/** ↗ opens another site */
export const ExternalLink = (p: P = {}) => icon(<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />, p);
/** ✓ done, on */
export const Check = (p: P = {}) => icon(<path d="M5 12.5l4.5 4.5L19 7" />, p);
/** × ✕ close, remove */
export const Close = (p: P = {}) => icon(<path d="M6 6l12 12M18 6L6 18" />, p);
/** ▾ a menu that opens */
export const ChevronDown = (p: P = {}) => icon(<path d="M6 9l6 6 6-6" />, p);
/** ▸ ▶ collapsed, or a row that opens */
export const ChevronRight = (p: P = {}) => icon(<path d="M9 6l6 6-6 6" />, p);
/** ↑ a rise, or sorted high first */
export const ArrowUp = (p: P = {}) => icon(<path d="M12 19V5M6 11l6-6 6 6" />, p);
/** ↓ a fall, or sorted low first */
export const ArrowDown = (p: P = {}) => icon(<path d="M12 5v14M6 13l6 6 6-6" />, p);
/** ✎ edit */
export const Pencil = (p: P = {}) => icon(<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />, p);
/** 🔗 a link */
export const LinkIcon = (p: P = {}) => icon(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />, p);
/** 🌐 every country, the world */
export const Globe = (p: P = {}) => icon(<><circle cx={12} cy={12} r={8.5} /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" /></>, p);
/** 👑 the leader */
export const Crown = (p: P = {}) => icon(<path d="M4 17h16M5 17L4 8l5 4 3-6 3 6 5-4-1 9" />, p);
/** ⌨ keyboard shortcuts */
export const Keyboard = (p: P = {}) => icon(<><rect x={3} y={6} width={18} height={12} rx={2} /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>, p);
/** + add */
export const Plus = (p: P = {}) => icon(<path d="M12 5v14M5 12h14" />, p);
/** a search box */
export const Search = (p: P = {}) => icon(<><circle cx={11} cy={11} r={6.5} /><path d="M16 16l4 4" /></>, p);
/** a quote */
export const Quote = (p: P = {}) => icon(<path d="M9 7H6a1 1 0 0 0-1 1v4h4v-4M18 7h-3a1 1 0 0 0-1 1v4h4v-4M9 12c0 3-1.5 5-4 5M18 12c0 3-1.5 5-4 5" />, p);
/** more actions (a kebab) */
export const More = (p: P = {}) => icon(<path d="M12 6h.01M12 12h.01M12 18h.01" />, p);
