# Arrowsterr: rules for anyone changing this code

## Never stack code on top of code

- **One stylesheet.** `src/app/globals.css` is the only one. Never add a second stylesheet, and never add a block that loads later to win.
- **Change things in place.** To change how a part looks, edit its rule. To change a look everywhere, edit the token. Delete what you replace in the same change.
- **One rule per selector.** No `#id` or `:root` added to a selector to beat another rule. `!important` is for print, reduced motion and beating an inline style.
- **One part per job.** Before adding a class or component, look for the one that already does it: `aw-stats` for numbers, `aw-steps` for steps, `aw-frame` for cards, `aw-props` for a details rail, the parts in `src/components/ui.tsx`. Reuse it or change it. Do not add a second version beside it.
- **No new "look" files.** A redesign is a change to tokens and rules in `globals.css` plus `docs/brand.md`. It is never a new layer, a new version file or a wrapper around the old code.

`tests/oneStylesheet.test.ts` checks the stylesheet rules. Keep it passing.

## The look

`docs/brand.md` is the source of truth. The short version:

- Geist for every word. Signal Blue is the one accent. One primary button per screen.
- Corners come from six tokens: `rounded-aw-xs` 4, `rounded-aw-sm` 6, `rounded-aw` 8 (buttons, inputs), `rounded-aw-lg` 12 (cards), `rounded-aw-xl` 16 (page panel, dialogs), `rounded-full`. Never a raw size such as `rounded-md` or `rounded-[10px]`.
- Shadows are `shadow-aw-sm`, `shadow-aw` and `shadow-aw-lg`. Colors are the token utilities (`text-muted`, `bg-surface-2`, `border-rule`). Never a raw hex in a class.
- A box with a full border gets a corner class.

## Checks before you finish

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run typecheck
```
