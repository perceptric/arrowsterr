# UI and UX references

The public rule sets worth building from, checked November 13, 2026. Each section gives the working link, who publishes it, its license, and its key rules in our own words. Read the source before quoting it.

---

## 1. Vercel Web Interface Guidelines

- **Link:** https://vercel.com/design/guidelines (source and an `AGENTS.md` version: https://github.com/vercel-labs/web-interface-guidelines)
- **Publisher:** Vercel. A "living, non-exhaustive" list. No license on the page.

**Interactions**
- Everything works by keyboard (WAI-ARIA patterns). Every focusable thing shows a focus ring with `:focus-visible`, and sticky bars never cover it.
- Hit targets: at least 24px, and 44px on mobile.
- Inputs use 16px text or larger on mobile, so iOS doesn't zoom. Never turn off zoom or block paste.
- A loading button keeps its label and adds an indicator.
- Spinners and skeletons wait about 150 to 300 ms before showing, then stay at least 300 to 500 ms.
- State lives in the URL: filters, tabs, pages and open panels can be shared and survive a refresh.
- Optimistic updates roll back or offer Undo when the save fails.
- Destructive actions ask first or offer Undo.
- Links are links (`a`), so Cmd-click works. Toasts and inline errors use polite `aria-live`.
- Every drag, swipe or pinch has a click and keyboard way to do the same thing.

**Animation**
- Honor `prefers-reduced-motion`. Animate only `transform` and `opacity`, never `transition: all`.
- Animate only to show cause and effect, and let people interrupt it. No autoplay.

**Layout and content**
- Align everything on purpose. Check mobile, laptop and very wide screens. Respect safe areas.
- Skeletons match the final layout. Every screen has a next step or a way back, including empty, dense and error states.
- Tabular numbers for comparing figures. Never use color alone. Icon-only buttons get a label.

**Forms**
- Every control has a label. Enter submits a single field; Cmd/Ctrl+Enter submits a text area.
- Keep Submit on until the request starts, then disable it and send an idempotency key.
- Show errors next to the field, and on submit move focus to the first error.
- Set `autocomplete`, `type` and `inputmode`. Warn before leaving unsaved changes.

**Performance and design**
- Saves (POST, PATCH, DELETE) finish in under 500 ms. Virtualize long lists. Give images their size to stop layout shift.
- A child's corner radius is no larger than its parent's. Hover, active and focus states have more contrast than rest.

---

## 2. Laws of UX

- **Link:** https://lawsofux.com (each law has its own page, for example https://lawsofux.com/fittss-law/)
- **Publisher:** Jon Yablonski (check: the fetched page didn't name him; see https://lawsofux.com/about/). No license in the page text.

The 30 laws, one line each:

| Law | In plain words |
|---|---|
| Aesthetic-Usability Effect | People think good-looking design is easier to use |
| Choice Overload | Too many options overwhelm people |
| Chunking | Group information into small meaningful pieces |
| Cognitive Bias | Thinking shortcuts shape what people see and decide |
| Cognitive Load | Each screen costs mental effort; keep it low |
| Doherty Threshold | People stay productive when the app answers within 400 ms |
| Fitts's Law | Bigger, closer targets are faster to hit |
| Flow | People do their best work when fully focused |
| Goal-Gradient Effect | People speed up as they near a goal |
| Hick's Law | More choices mean slower decisions |
| Jakob's Law | People expect your app to work like the ones they already use |
| Law of Common Region | Things inside one border look like a group |
| Law of Proximity | Things close together look like a group |
| Law of Prägnanz | People see shapes in their simplest form |
| Law of Similarity | Things that look alike look related |
| Law of Uniform Connectedness | Things joined by a line or color look related |
| Mental Model | People bring a belief about how the app works |
| Miller's Law | People hold about 7 (plus or minus 2) items in mind |
| Occam's Razor | Prefer the simplest answer that works |
| Paradox of the Active User | People skip the manual and start clicking |
| Pareto Principle | About 80% of the results come from 20% of the causes |
| Parkinson's Law | A task fills the time you give it |
| Peak-End Rule | People judge an experience by its best moment and its end |
| Postel's Law | Accept messy input, send clean output |
| Selective Attention | People notice only what fits their goal |
| Serial Position Effect | People remember the first and last items best |
| Tesler's Law | Some complexity can't be removed, only moved |
| Von Restorff Effect | The one item that looks different gets remembered |
| Working Memory | Short-term memory for the task at hand is small |
| Zeigarnik Effect | People remember unfinished tasks better than finished ones |

---

## 3. Nielsen Norman Group: 10 usability heuristics

- **Link:** https://www.nngroup.com/articles/ten-usability-heuristics/
- **Publisher:** Nielsen Norman Group, by Jakob Nielsen (1994, last reviewed January 30, 2024). Free to use in your own work with credit to Jakob Nielsen and a link. Reprints need permission.

1. **Show what's happening.** Give quick feedback on every action and every wait.
2. **Speak the user's language.** Use their words and real-world order.
3. **Give people a way out.** Clear exits, Undo and Redo.
4. **Be consistent.** Same words and actions mean the same thing everywhere, and follow platform habits.
5. **Prevent errors.** Remove the chance to make them, or confirm before a big action.
6. **Show, don't make people remember.** Keep options and information on screen.
7. **Offer shortcuts.** Let experts go faster and tailor frequent actions.
8. **Keep it minimal.** Leave out what people rarely need.
9. **Help people fix errors.** Plain words that name the problem and the fix.
10. **Make help easy to find.** Short, task-focused and close to where it's needed.

---

## 4. Apple Human Interface Guidelines

- **Link:** https://developer.apple.com/design/human-interface-guidelines/ (pages: `/layout`, `/accessibility`, `/typography`, `/motion`)
- **Publisher:** Apple. Covered by Apple's site terms.

**Control size** (default, then minimum)

| Platform | Default | Minimum |
|---|---|---|
| iOS, iPadOS | 44 x 44 pt | 28 x 28 pt |
| macOS | 28 x 28 pt | 20 x 20 pt |
| tvOS | 66 x 66 pt | 56 x 56 pt |
| visionOS | 60 x 60 pt | 28 x 28 pt |
| watchOS | 44 x 44 pt | 28 x 28 pt |

Space between controls matters as much as their size.

**Text size** (default, then minimum): iOS 17 pt and 11 pt, macOS 13 pt and 10 pt, tvOS 29 pt and 23 pt, visionOS 17 pt and 12 pt, watchOS 16 pt and 12 pt. Thin weights need larger sizes.

**Contrast:** 4.5:1 for text up to 17 pt, 3:1 for 18 pt and up or bold text (WCAG AA). Offer a higher-contrast look when Increase Contrast is on, and check both light and dark.

**Layout:** put the most important things at the top and leading side. Align items to make them easy to scan, and indent to show what belongs to what. Group related items with space, shapes or lines.

**Motion:** add motion only with a purpose. Never use it as the only way to say something. Keep feedback animations short and precise. Avoid motion on things people do often. Let people cancel an animation without waiting.

---

## 5. Material Design 3

- **Link:** https://m3.material.io (pages: `/foundations/layout/grids-spacing/spacing`, `/foundations/designing/structure`, `/foundations/designing/elements`, `/styles/motion/easing-and-duration/tokens-specs`, `/styles/typography/type-scale-tokens`)
- **Publisher:** Google. Material calls itself open source; check each asset's license.

**Targets:** touch targets at least 48 x 48 dp (about 9 mm). A 24 dp icon sits inside a 48 dp target. The recommended physical size is 7 to 10 mm.

**Spacing:** use space to group, to point attention and to set the mood. Dense feels serious; roomy feels calm. Keep spacing the same between related things so the eye finds a rhythm. Align leading thumbnails, avatars and icons. Put buttons close to the content they change.

**Labels:** icon-only buttons, interactive images, status icons and progress bars need an accessibility label. Generic text like "Learn more" needs more context. Never put the role ("button") in the label.

**Type:** one scale of 15 baseline styles plus 15 emphasized ones, from Display Large to Label Small. Pick only the styles a product needs.

**Motion durations:** short 50 to 200 ms (small controls; selection controls use 200 ms), medium 250 to 400 ms, long 450 to 600 ms (large transitions), extra long 700 to 1000 ms (rare, ambient). **Easing:** standard `cubic-bezier(0.2, 0, 0, 1)` for small transitions, emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)` and emphasized accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)` for larger ones. Material now moves components to spring-based "motion physics"; these durations still apply to transitions.

---

## 6. GOV.UK Design System

- **Link:** https://design-system.service.gov.uk (pages: `/components/error-message/`, `/components/error-summary/`, `/patterns/question-pages/`; writing guidance at https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/)
- **Publisher:** Government Digital Service. Open Government Licence v3.0, Crown copyright.

**Error messages**
- Show the error next to the field and in a summary at the top. Use the same words in both.
- Say what went wrong and how to fix it, in plain, specific words. Never "An error occurred" or "This field is required".
- Skip "please", "sorry", "valid", "invalid", "forbidden" and jokes.
- An empty field gets an instruction ("Enter your name"). A wrong format gets a description.
- Never clear what the person typed.

**Error summary**
- Always show it, even for one error, above the page heading, titled "There is a problem".
- Each item links to its field. Add "Error:" to the page title and move focus to the summary.

**Question pages**
- One question per page where you can, and the question is the page heading.
- Ask only what you need, never twice in one journey, and say why you ask.
- Mark optional fields "(optional)". Never use asterisks.
- Hint text is one short sentence with no full stop and no links.

---

## 7. Shopify Polaris (now the Shopify App Design Guidelines)

- **Link:** https://shopify.dev/docs/apps/design (content: `/content`, layout: `/layout`, visual design: `/visual-design`; components at https://shopify.dev/docs/api/polaris). The old polaris.shopify.com and polaris-react.shopify.com now redirect there.
- **Publisher:** Shopify. No license on the pages read.

- Match the host app's look and behavior, since people move between your screens and its own.
- Design for mobile first; most store traffic is on phones.
- Write at a US grade 7 reading level, with headings, bullets and short sentences. No jargon, idioms or large blocks of text.
- Use one word for each thing and each action, everywhere. No synonyms for key ideas.
- Don't repeat content: no page title under the title bar, and no second navigation that copies the main one.
- Tone shifts with the moment: an error is more direct than an onboarding tip.

---

## 8. GitHub Primer

- **Link:** https://primer.style/product/ (pages: `/product/ui-patterns/empty-states/`, `/product/ui-patterns/loading/`, `/product/components/data-table/`, `/product/components/blankslate/`)
- **Publisher:** GitHub. No license on the pages read.

**Data tables**
- Give each table a title linked by `aria-labelledby`.
- A sortable table always has one column sorted by default. Clicking the sorted column flips the order; a new column sorts ascending first.
- Right-align numbers and left-align text. Densities: condensed, normal (default) and spacious.
- Row actions go in the last column. More than one action goes in a menu, with at most one pulled out.

**Empty states**
- A picture, a main line, an optional second line, one main action and an optional "learn more" link.
- A first-time empty state welcomes and explains the feature. A temporarily empty one says why. An error state names the problem.
- Error states are never playful: no jargon, no error codes and no vague "There was a problem". Point to a way to recover.
- Save playful pictures for first-time screens.

**Loading**
- Under 1 second: show nothing, since a flash of a loader feels slower.
- 1 to 3 seconds: a spinner.
- 3 to 10 seconds: a progress bar if you can.
- Over 10 seconds: a progress bar, and run it in the background so people can keep working.
- Show items as they arrive. Put the loader where the content will appear and avoid layout shift.
- Give every loader a text label, announce results with `role="status"`, and set `aria-busy` while updating. If it fails, move focus to the error.

---

## 9. WCAG 2.2

- **Link:** https://www.w3.org/TR/WCAG22/ (quick reference: https://www.w3.org/WAI/WCAG22/quickref/)
- **Publisher:** W3C. Recommendation of December 12, 2024. W3C Document License.

**Four principles:** content must be perceivable, operable, understandable and robust. 13 guidelines at three levels: A, AA, AAA. Aim for AA.

| Rule | Level | What it asks |
|---|---|---|
| 1.3.1 Info and Relationships | A | Structure shown on screen is in the code too (headings, lists, labels) |
| 1.3.5 Identify Input Purpose | AA | Fields like name and email say what they're for (autocomplete) |
| 1.4.3 Contrast (Minimum) | AA | Text 4.5:1; large text 3:1 |
| 1.4.4 Resize Text | AA | Works with text at 200% |
| 1.4.10 Reflow | AA | Works at 320 CSS px wide with no sideways scroll |
| 1.4.11 Non-text Contrast | AA | Controls, borders of inputs and key graphics 3:1 |
| 1.4.12 Text Spacing | AA | Still works with line height 1.5x, paragraph space 2x, letter space 0.12x, word space 0.16x |
| 2.1.1 Keyboard | A | Everything works by keyboard |
| 2.4.7 Focus Visible | AA | The focus ring is always visible |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Sticky bars and popups never hide the focused item |
| 2.5.7 Dragging Movements | AA | Anything done by dragging can be done with clicks |
| 2.5.8 Target Size (Minimum) | AA | Targets at least 24 x 24 CSS px, or enough space around them |
| 3.2.6 Consistent Help | A | Help sits in the same place on every page |
| 3.3.1 Error Identification | A | Errors are named in text |
| 3.3.2 Labels or Instructions | A | Every field has a label |
| 3.3.7 Redundant Entry | A | Never ask for the same thing twice in one flow |
| 3.3.8 Accessible Authentication (Minimum) | AA | Sign-in needs no memory test or puzzle; allow paste and password managers |

**New in 2.2:** 2.4.11, 2.4.12 (AAA), 2.4.13 (AAA), 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8 and 3.3.9 (AAA). 4.1.1 Parsing was removed.

---

## Where they agree

These rules show up in three or more of the sources, so they're the safest to make house rules:

- **Targets:** at least 24px on desktop and 44 to 48px on touch (Vercel, Apple, Material, WCAG 2.5.8).
- **Contrast:** 4.5:1 for text, 3:1 for large text and controls (Apple, Vercel, WCAG).
- **Focus:** always visible and never covered (Vercel, Material, WCAG 2.4.7 and 2.4.11).
- **Errors:** next to the field, in plain words that say how to fix it, without clearing input (NN/g 9, GOV.UK, Vercel, Primer).
- **Loading:** nothing for very short waits, a spinner for short ones, progress for long ones (Vercel, Primer, NN/g 1).
- **Motion:** short, purposeful, interruptible and off with reduced motion (Apple, Material, Vercel).
- **Plain words:** grade 7 to 9 reading level, one term per idea (Shopify, GOV.UK, NN/g 2 and 4).
- **Empty states:** say why it's empty and give one next step (Primer, Vercel, NN/g 6).
