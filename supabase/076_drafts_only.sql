-- Drafts only (docs/drafts-plan.md): there is no Content Brief any more, so no piece waits at Brief ready.
-- Pieces left there go back to Planned; the Write button writes their draft. Their briefs stay, unused.
update calendar_items set status = 'planned' where status = 'brief';
