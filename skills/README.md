# Writing skills

The editing methods Agentic Writing uses for its style review and fixes and for the claim check (docs/agentic-writing.md, section 6), and the brand methods Zippie uses to learn a brand's voice and write its guidelines during onboarding (section 3). Each one is open source; its LICENSE file sits next to it.

| Skill | Used for | Copyright |
|---|---|---|
| `humanizer` | Style review and fixes | Siqi Chen |
| `anti-ai-writing` | Style review and fixes (strict review) | Tato Polanco |
| `writing-enforcer` (with its AI pattern catalog) | Style review and fixes | Contributors |
| `proofread` | Style review | Sergey Skripko |
| `claim-boundary-checker` | Claim check | Contributors |
| `voice-profiler` | Learning a brand's voice from its pages (MIT) | Branded Mayhem Collective LLC |
| `brand-review` | Writing brand guidelines: voice, messages, style rules, claims (Apache 2.0) | Anthropic |
| `style-sheet` (with its variant families and defaults) | Writing rules: spelling, capitals, numbers, punctuation (MIT) | Sergey Skripko |

After changing a file here, run `node scripts/skills.mjs` to rebuild `src/lib/skillText.ts`.
