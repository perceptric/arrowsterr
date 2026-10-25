# Skill packs

Third-party Claude Code skills for the UI work in `docs/unify-plan.md`, copied as-is from their public repos (by way of
the Omniscient and Perceptric repos, which use the same copies). Each folder here is one skill. Update by copying again
from the source.

| Skill | Used for in the plan | Source |
| --- | --- | --- |
| `ui-ux-pro-max` | Navigation, tables, empty states, accessibility rules (Parts 1 to 6) | github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| `taste-skill` | One question per screen, the app-screen inspector and critique (7.1, 7.8) | github.com/Leonxlnx/taste-skill |
| `motion-director` | The motion system (7.2) | github.com/frankxai/awesome-motion-design-agent-skills (CC0) |
| `web-motion-auditor` | Checking every transition (7.2) | github.com/frankxai/awesome-motion-design-agent-skills (CC0) |
| `performance-optimization` | Speed you can feel (7.4) | github.com/addyosmani/agent-skills |
| `webapp-testing` | The screens check and screenshots (Part 6, 7.9) | github.com/anthropics/skills (LICENSE.txt in its folder) |
| `browser-testing-with-devtools` | Console, network and layout checks in a real browser (7.9) | github.com/addyosmani/agent-skills |

`dataviz` (charts, 7.3) is built into the Claude account, so it has no folder here and loads in every session.

The taste-skill scripts need Node 22+ and Chromium (preinstalled in cloud sessions). The UI/UX Pro Max search needs
Python 3. Lint and typecheck skip this folder.

Running cost: none on its own. A skill only adds Claude tokens in a session that loads it.
