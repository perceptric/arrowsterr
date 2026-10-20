# Product UI: Twenty's design system

The app follows Twenty's design system (twentyhq/twenty, `packages/twenty-ui/src/theme`) with Arrowsterr's logo. It all lives in `src/app/twenty-ui.css`, loaded last, so it wins over `brand.css`, `brand-v2.css`, `twenty.css` and `brand-v5.css`. Every value is a Twenty token. The `--aw-*` tokens and the Tailwind colors point at them, so screens follow without markup changes.

## The rules
- **Type:** Inter only, 13px body, weights 400 to 600, no tracking, no all-caps. DM Mono for code. Display 24px, title 20px (`aw-h2`), heading 16px (`aw-h3`), `aw-h4` 13px semibold, labels 12px medium.
- **Color:** about 90% grey. Indigo blue `accent-9` (#3E63DD) marks the one next action, links and focus. Status and tags pair step 3 fills with step 11 text.
- **Buttons:** 32px (24px small), 12px medium, 4px corners. Primary blue, secondary white with a hairline, ghost with no fill until hover, danger red on a red tint. Disabled turns grey. Icon buttons are 32px with no fill until hover.
- **Inputs:** 32px, grey fill and hairline. Hover darkens the border; focus turns white with a blue border and a 3px soft blue halo.
- **Tags:** 20px pills, 12px medium.
- **Surfaces:** white panels and cards, 8px corners, hairline border, no shadow in the page flow. Menus 8px with a strong shadow; modals 16px on a dark overlay; the side panel floats 8px from the edges.
- **Tables:** 32px rows, 8px padding, grey medium headers, hairline grid, grey row hover, blue tint on selected rows.
- **Shell:** 220px sidebar on the canvas grey; nav items 32px, grey, the current one on a grey fill with primary text; the page sits in a white panel with a 48px breadcrumb header.
- **Tabs:** text tabs on a hairline; the picked one is primary text with a 1px underline.
- **Motion:** `background 0.1s ease` on clickable fills, off under reduced motion.
- **New markup** can use Twenty's own classes: `tw-btn`, `tw-tag`, `tw-card`, `tw-field`, `tw-modal`, `tw-side-panel`, `tw-tooltip`, `tw-snack`.
- **Dark theme:** the tokens carry dark values under `data-theme="dark"`. Nothing switches it on yet.

## Running cost
None. This is styling only, with one free Google font (DM Mono). Beta (50 teams): $0. Growth (500 teams): $0.

## The website (arrowsterr.com)
The WordPress site takes only Twenty's fonts, from the `wp-plugin/arrowsterr-twenty` plugin: Inter for headings and text in place of Funnel Display and Geist, and DM Mono for numbers and code in place of Geist Mono. Colors (#0943B0), buttons, the Notch, the Climb and the layouts stay as the theme has them. To install: zip the `arrowsterr-twenty` folder, upload it under Plugins → Add New → Upload, and activate it. Deactivate it to go back.

Running cost: none. Beta (50 teams): $0. Growth (500 teams): $0.
