-- The writer persona at onboarding (docs/zippie-skills-plan.md, section 4). Onboarding reads the brand's own site and
-- posts and builds the persona every article is written from: who writes, the reader, the point of view, approved
-- proof (each quoted from the site), claims to never make, the CTA and a sample paragraph. The voice fields stay in
-- brand_voices.voice, which the writer already reads. Safe to run again.

alter table public.brand_voices add column if not exists persona jsonb;         -- see WriterPersona in src/lib/writerPersona.ts
alter table public.brand_voices add column if not exists persona_stats jsonb;   -- VoiceStats: measured from the brand's posts
alter table public.brand_voices add column if not exists persona_at timestamptz;
