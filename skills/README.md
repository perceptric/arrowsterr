# Writing skills

The editing methods Agentic Writing uses for its style review and fixes, and for the claim check (docs/agentic-writing.md, section 6). Each one is open source under the MIT License (brand-review: Apache License 2.0); its LICENSE file sits next to it.

| Skill | Used for | Copyright |
|---|---|---|
| `humanizer` | Style review and fixes | Siqi Chen |
| `anti-ai-writing` | Style review and fixes (strict review) | Tato Polanco |
| `writing-enforcer` (with its AI pattern catalog) | Style review and fixes | Contributors |
| `proofread` | Style review | Sergey Skripko |
| `claim-boundary-checker` | Claim check | Contributors |
| `proseshape` | Polish: default shapes (hook, three tips, upbeat close, epilogue) | ProseShape contributors |
| `brand-review` | Polish: voice check against the writer persona | See its LICENSE (Apache 2.0) |
| `plain-language` | Polish: short everyday words | Surendran B |
| `orwells-rules` | Polish: dead phrases, jargon, passive voice | Surendran B |
| `redline-edit` (with its wordy phrases list) | Polish: medium copyedit | Sergey Skripko |

After changing a file here, run `node scripts/skills.mjs` to rebuild `src/lib/skillText.ts`.
