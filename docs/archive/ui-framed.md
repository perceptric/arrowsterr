# Framed UI (v11)

The app now uses the same house style as Omniscient (`dev-omniscient/omniscient`, `docs/brand.md`): black and white, square and framed. It ships as `src/app/omni-ui.css`, loaded last in `globals.css`, so class names stay the same and every screen changes at once.

## The rules

- **Color.** Black `#0A0A0A` on white with plain grays (`#737373`, `#A3A3A3`, `#C4C4C4`). Black is the one action color: the main button, links, the current page in the sidebar, the picked switch and focus.
- **Signal Blue** (`#2760CF`, text `#0943B0`) stays ours. It marks your own brand: the "You" tag and your series in charts. About 5% of a screen.
- **Status.** Green `#0A7A52`, orange `#B7791F` and red `#C2412D`, as text or a tag only.
- **Shape.** Every corner is square. `rounded-full` stays only for faces and radio buttons. No shadows and no gradients.
- **Frames.** Cards, tables, menus, dialogs, side panels, buttons and filters get a 1px black frame. Rows inside use gray hairlines (`#E5E5E5`, `#F0F0F0`).
- **Type.** Inter at 13px. Page titles 30px, weight 500, -0.035em. Big numbers 28px, weight 400. Section labels in the sidebar are mono, in brackets: `[ AI Visibility ]`.
- **Shell.** White edge to edge. A black rule splits the sidebar from the page and runs under the workspace switch. The current page is solid black with white text.
- **Buttons.** 32px and square, 12px weight 500. Primary is solid black. Secondary is white with a black frame. Ghost is text only. They shrink to 96% when pressed.
- **Fields.** White with a gray border that turns black on hover. Focus is a black border plus a 1px black ring.
- **Tags.** 20px squares with a light fill, colored text and a 1px frame in the same color.
- **Switches.** A black-framed row of square cells. The picked one is solid black.
- **Motion.** 120ms, 200ms and 320ms, with two curves. Only transform and opacity move. Reduced motion turns it off.

## Running cost

None. It is one static stylesheet and uses fonts the app already loads.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
