-- arrowsterr: security. Built from the running database. Unused objects were removed in the move (see README.md).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- row security: answers
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- policy: answers answers add
CREATE POLICY "answers add" ON public.answers FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: answers answers read
CREATE POLICY "answers read" ON public.answers FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- policy: article_ai_answers article answers read
CREATE POLICY "article answers read" ON public.article_ai_answers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.article_runs r
  WHERE ((r.id = article_ai_answers.run_id) AND public.has_role(r.workspace_id, 'viewer'::public.ws_role)))));

-- policy: article_pages article pages read
CREATE POLICY "article pages read" ON public.article_pages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.article_runs r
  WHERE ((r.id = article_pages.run_id) AND public.has_role(r.workspace_id, 'viewer'::public.ws_role)))));

-- policy: article_runs article runs read
CREATE POLICY "article runs read" ON public.article_runs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: article_serp article serp read
CREATE POLICY "article serp read" ON public.article_serp FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.article_runs r
  WHERE ((r.id = article_serp.run_id) AND public.has_role(r.workspace_id, 'viewer'::public.ws_role)))));

-- row security: article_ai_answers
ALTER TABLE public.article_ai_answers ENABLE ROW LEVEL SECURITY;

-- row security: article_pages
ALTER TABLE public.article_pages ENABLE ROW LEVEL SECURITY;

-- row security: article_runs
ALTER TABLE public.article_runs ENABLE ROW LEVEL SECURITY;

-- row security: article_serp
ALTER TABLE public.article_serp ENABLE ROW LEVEL SECURITY;

-- policy: ask_knowledge ask knowledge read
CREATE POLICY "ask knowledge read" ON public.ask_knowledge FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: ask_messages ask messages read
CREATE POLICY "ask messages read" ON public.ask_messages FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: ask_projects ask projects read
CREATE POLICY "ask projects read" ON public.ask_projects FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: ask_skills ask skills read
CREATE POLICY "ask skills read" ON public.ask_skills FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: ask_threads ask threads read
CREATE POLICY "ask threads read" ON public.ask_threads FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: ask_knowledge
ALTER TABLE public.ask_knowledge ENABLE ROW LEVEL SECURITY;

-- row security: ask_messages
ALTER TABLE public.ask_messages ENABLE ROW LEVEL SECURITY;

-- row security: ask_projects
ALTER TABLE public.ask_projects ENABLE ROW LEVEL SECURITY;

-- row security: ask_skills
ALTER TABLE public.ask_skills ENABLE ROW LEVEL SECURITY;

-- row security: ask_threads
ALTER TABLE public.ask_threads ENABLE ROW LEVEL SECURITY;

-- policy: brand_guidelines brand guidelines add
CREATE POLICY "brand guidelines add" ON public.brand_guidelines FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_guidelines brand guidelines delete
CREATE POLICY "brand guidelines delete" ON public.brand_guidelines FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_guidelines brand guidelines edit
CREATE POLICY "brand guidelines edit" ON public.brand_guidelines FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_guidelines brand guidelines read
CREATE POLICY "brand guidelines read" ON public.brand_guidelines FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: brand_kits brand kit add
CREATE POLICY "brand kit add" ON public.brand_kits FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_kits brand kit delete
CREATE POLICY "brand kit delete" ON public.brand_kits FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_kits brand kit edit
CREATE POLICY "brand kit edit" ON public.brand_kits FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_kits brand kit read
CREATE POLICY "brand kit read" ON public.brand_kits FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: brand_voices brand voice add
CREATE POLICY "brand voice add" ON public.brand_voices FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_voices brand voice delete
CREATE POLICY "brand voice delete" ON public.brand_voices FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_voices brand voice edit
CREATE POLICY "brand voice edit" ON public.brand_voices FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brand_voices brand voice read
CREATE POLICY "brand voice read" ON public.brand_voices FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: brand_guidelines
ALTER TABLE public.brand_guidelines ENABLE ROW LEVEL SECURITY;

-- row security: brand_kits
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

-- row security: brand_settings
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;

-- row security: brand_voices
ALTER TABLE public.brand_voices ENABLE ROW LEVEL SECURITY;

-- row security: brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- policy: brands brands add
CREATE POLICY "brands add" ON public.brands FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brands brands delete
CREATE POLICY "brands delete" ON public.brands FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brands brands edit
CREATE POLICY "brands edit" ON public.brands FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: brands brands read
CREATE POLICY "brands read" ON public.brands FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: bulk_runs bulk runs add
CREATE POLICY "bulk runs add" ON public.bulk_runs FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: bulk_runs bulk runs delete
CREATE POLICY "bulk runs delete" ON public.bulk_runs FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: bulk_runs bulk runs read
CREATE POLICY "bulk runs read" ON public.bulk_runs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: bulk_runs
ALTER TABLE public.bulk_runs ENABLE ROW LEVEL SECURITY;

-- policy: calendar_items calendar add
CREATE POLICY "calendar add" ON public.calendar_items FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: calendar_items calendar delete
CREATE POLICY "calendar delete" ON public.calendar_items FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: calendar_items calendar edit
CREATE POLICY "calendar edit" ON public.calendar_items FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: calendar_items calendar read
CREATE POLICY "calendar read" ON public.calendar_items FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: calendar_items
ALTER TABLE public.calendar_items ENABLE ROW LEVEL SECURITY;

-- policy: change_sets change sets read
CREATE POLICY "change sets read" ON public.change_sets FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: change_sets
ALTER TABLE public.change_sets ENABLE ROW LEVEL SECURITY;

-- row security: changes
ALTER TABLE public.changes ENABLE ROW LEVEL SECURITY;

-- policy: changes changes read
CREATE POLICY "changes read" ON public.changes FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: cms_connections
ALTER TABLE public.cms_connections ENABLE ROW LEVEL SECURITY;

-- row security: cost_ledger
ALTER TABLE public.cost_ledger ENABLE ROW LEVEL SECURITY;

-- policy: daily_metrics daily metrics read
CREATE POLICY "daily metrics read" ON public.daily_metrics FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: daily_metrics
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

-- policy: doc_publications doc publications read
CREATE POLICY "doc publications read" ON public.doc_publications FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: doc_versions doc versions add
CREATE POLICY "doc versions add" ON public.doc_versions FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: doc_versions doc versions delete
CREATE POLICY "doc versions delete" ON public.doc_versions FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: doc_versions doc versions read
CREATE POLICY "doc versions read" ON public.doc_versions FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: doc_publications
ALTER TABLE public.doc_publications ENABLE ROW LEVEL SECURITY;

-- row security: doc_versions
ALTER TABLE public.doc_versions ENABLE ROW LEVEL SECURITY;

-- row security: docs
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;

-- policy: docs docs add
CREATE POLICY "docs add" ON public.docs FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: docs docs delete
CREATE POLICY "docs delete" ON public.docs FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: docs docs edit
CREATE POLICY "docs edit" ON public.docs FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: docs docs read
CREATE POLICY "docs read" ON public.docs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: email_log
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- row security: free_runs
ALTER TABLE public.free_runs ENABLE ROW LEVEL SECURITY;

-- row security: ga4_connections
ALTER TABLE public.ga4_connections ENABLE ROW LEVEL SECURITY;

-- row security: gsc_connections
ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY;

-- policy: industry_research industry research read
CREATE POLICY "industry research read" ON public.industry_research FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: industry_research
ALTER TABLE public.industry_research ENABLE ROW LEVEL SECURITY;

-- row security: integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- policy: workspace_invites invites create
CREATE POLICY "invites create" ON public.workspace_invites FOR INSERT WITH CHECK ((public.has_role(workspace_id, 'admin'::public.ws_role) AND (role <> 'owner'::public.ws_role) AND (invited_by = auth.uid())));

-- policy: workspace_invites invites read
CREATE POLICY "invites read" ON public.workspace_invites FOR SELECT USING (public.has_role(workspace_id, 'admin'::public.ws_role));

-- policy: workspace_invites invites revoke
CREATE POLICY "invites revoke" ON public.workspace_invites FOR DELETE USING (public.has_role(workspace_id, 'admin'::public.ws_role));

-- row security: jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- policy: keyword_runs keyword runs add
CREATE POLICY "keyword runs add" ON public.keyword_runs FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: keyword_runs keyword runs delete
CREATE POLICY "keyword runs delete" ON public.keyword_runs FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: keyword_runs keyword runs edit
CREATE POLICY "keyword runs edit" ON public.keyword_runs FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: keyword_runs keyword runs read
CREATE POLICY "keyword runs read" ON public.keyword_runs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: keyword_cache
ALTER TABLE public.keyword_cache ENABLE ROW LEVEL SECURITY;

-- row security: keyword_runs
ALTER TABLE public.keyword_runs ENABLE ROW LEVEL SECURITY;

-- policy: workspace_members members change role
CREATE POLICY "members change role" ON public.workspace_members FOR UPDATE USING ((public.has_role(workspace_id, 'admin'::public.ws_role) AND (role <> 'owner'::public.ws_role))) WITH CHECK ((public.has_role(workspace_id, 'admin'::public.ws_role) AND (role <> 'owner'::public.ws_role)));

-- policy: workspace_members members read
CREATE POLICY "members read" ON public.workspace_members FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: workspace_members members remove
CREATE POLICY "members remove" ON public.workspace_members FOR DELETE USING (((role <> 'owner'::public.ws_role) AND (public.has_role(workspace_id, 'admin'::public.ws_role) OR (user_id = auth.uid()))));

-- row security: mentions
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- policy: mentions mentions read
CREATE POLICY "mentions read" ON public.mentions FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: notification_prefs
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

-- row security: oauth_clients
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

-- row security: oauth_codes
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

-- policy: outreach_lists outreach lists read
CREATE POLICY "outreach lists read" ON public.outreach_lists FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: outreach_suppression outreach suppression read
CREATE POLICY "outreach suppression read" ON public.outreach_suppression FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: outreach_targets outreach targets read
CREATE POLICY "outreach targets read" ON public.outreach_targets FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: outreach_lists
ALTER TABLE public.outreach_lists ENABLE ROW LEVEL SECURITY;

-- row security: outreach_suppression
ALTER TABLE public.outreach_suppression ENABLE ROW LEVEL SECURITY;

-- row security: outreach_targets
ALTER TABLE public.outreach_targets ENABLE ROW LEVEL SECURITY;

-- policy: perception_reads perception read
CREATE POLICY "perception read" ON public.perception_reads FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: perception_reads
ALTER TABLE public.perception_reads ENABLE ROW LEVEL SECURITY;

-- policy: notification_prefs prefs add
CREATE POLICY "prefs add" ON public.notification_prefs FOR INSERT WITH CHECK (((user_id = auth.uid()) AND public.has_role(workspace_id, 'viewer'::public.ws_role)));

-- policy: notification_prefs prefs edit
CREATE POLICY "prefs edit" ON public.notification_prefs FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- policy: notification_prefs prefs read
CREATE POLICY "prefs read" ON public.notification_prefs FOR SELECT USING ((user_id = auth.uid()));

-- row security: profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- policy: profiles profiles add
CREATE POLICY "profiles add" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));

-- policy: profiles profiles edit
CREATE POLICY "profiles edit" ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

-- policy: profiles profiles read
CREATE POLICY "profiles read" ON public.profiles FOR SELECT USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.workspace_members a
     JOIN public.workspace_members b ON ((b.workspace_id = a.workspace_id)))
  WHERE ((a.user_id = auth.uid()) AND (b.user_id = profiles.id))))));

-- row security: rate_buckets
ALTER TABLE public.rate_buckets ENABLE ROW LEVEL SECURITY;

-- policy: report_files report files delete
CREATE POLICY "report files delete" ON public.report_files FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_files report files read
CREATE POLICY "report files read" ON public.report_files FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: report_links report links delete
CREATE POLICY "report links delete" ON public.report_links FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_links report links edit
CREATE POLICY "report links edit" ON public.report_links FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_links report links read
CREATE POLICY "report links read" ON public.report_links FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: report_schedules report schedules delete
CREATE POLICY "report schedules delete" ON public.report_schedules FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_schedules report schedules read
CREATE POLICY "report schedules read" ON public.report_schedules FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: report_sends report sends read
CREATE POLICY "report sends read" ON public.report_sends FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: report_styles report style add
CREATE POLICY "report style add" ON public.report_styles FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_styles report style edit
CREATE POLICY "report style edit" ON public.report_styles FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_styles report style read
CREATE POLICY "report style read" ON public.report_styles FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: report_versions report versions add
CREATE POLICY "report versions add" ON public.report_versions FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_versions report versions delete
CREATE POLICY "report versions delete" ON public.report_versions FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: report_versions report versions read
CREATE POLICY "report versions read" ON public.report_versions FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: report_files
ALTER TABLE public.report_files ENABLE ROW LEVEL SECURITY;

-- row security: report_links
ALTER TABLE public.report_links ENABLE ROW LEVEL SECURITY;

-- row security: report_schedules
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

-- row security: report_sends
ALTER TABLE public.report_sends ENABLE ROW LEVEL SECURITY;

-- row security: report_styles
ALTER TABLE public.report_styles ENABLE ROW LEVEL SECURITY;

-- row security: report_versions
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

-- row security: reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- policy: reports reports delete
CREATE POLICY "reports delete" ON public.reports FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: reports reports edit
CREATE POLICY "reports edit" ON public.reports FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: reports reports read
CREATE POLICY "reports read" ON public.reports FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: runs
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- policy: runs runs add
CREATE POLICY "runs add" ON public.runs FOR INSERT WITH CHECK ((public.has_role(workspace_id, 'editor'::public.ws_role) AND (created_by = auth.uid()) AND (source = 'manual'::text) AND (status = 'done'::text)));

-- policy: runs runs delete
CREATE POLICY "runs delete" ON public.runs FOR DELETE USING (public.has_role(workspace_id, 'admin'::public.ws_role));

-- policy: runs runs read
CREATE POLICY "runs read" ON public.runs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: runs runs update
CREATE POLICY "runs update" ON public.runs FOR UPDATE USING ((public.has_role(workspace_id, 'editor'::public.ws_role) AND (created_by = auth.uid()) AND (source = 'manual'::text))) WITH CHECK ((public.has_role(workspace_id, 'editor'::public.ws_role) AND (created_by = auth.uid()) AND (source = 'manual'::text) AND (status = 'done'::text)));

-- policy: shared_reports shared reports add
CREATE POLICY "shared reports add" ON public.shared_reports FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: shared_reports shared reports delete
CREATE POLICY "shared reports delete" ON public.shared_reports FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: shared_reports shared reports read
CREATE POLICY "shared reports read" ON public.shared_reports FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: shared_answers
ALTER TABLE public.shared_answers ENABLE ROW LEVEL SECURITY;

-- row security: shared_reports
ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

-- policy: site_audits site audits read
CREATE POLICY "site audits read" ON public.site_audits FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: site_audits
ALTER TABLE public.site_audits ENABLE ROW LEVEL SECURITY;

-- row security: sites
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- policy: sites sites add
CREATE POLICY "sites add" ON public.sites FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: sites sites delete
CREATE POLICY "sites delete" ON public.sites FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: sites sites edit
CREATE POLICY "sites edit" ON public.sites FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: sites sites read
CREATE POLICY "sites read" ON public.sites FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: snapshots
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

-- row security: stripe_events
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- row security: task_purchases
ALTER TABLE public.task_purchases ENABLE ROW LEVEL SECURITY;

-- policy: task_purchases task_purchases_read
CREATE POLICY task_purchases_read ON public.task_purchases FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: usage
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

-- policy: usage_counters usage counters read
CREATE POLICY "usage counters read" ON public.usage_counters FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: usage usage read
CREATE POLICY "usage read" ON public.usage FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: usage_counters
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- row security: webhooks
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- row security: workspace_invites
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- row security: workspace_members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- row security: workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- policy: writer_briefs writer briefs read
CREATE POLICY "writer briefs read" ON public.writer_briefs FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: writer_cells writer cells add
CREATE POLICY "writer cells add" ON public.writer_cells FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_cells writer cells change
CREATE POLICY "writer cells change" ON public.writer_cells FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_cells writer cells delete
CREATE POLICY "writer cells delete" ON public.writer_cells FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_cells writer cells read
CREATE POLICY "writer cells read" ON public.writer_cells FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: writer_columns writer columns add
CREATE POLICY "writer columns add" ON public.writer_columns FOR INSERT WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_columns writer columns change
CREATE POLICY "writer columns change" ON public.writer_columns FOR UPDATE USING (public.has_role(workspace_id, 'editor'::public.ws_role)) WITH CHECK (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_columns writer columns delete
CREATE POLICY "writer columns delete" ON public.writer_columns FOR DELETE USING (public.has_role(workspace_id, 'editor'::public.ws_role));

-- policy: writer_columns writer columns read
CREATE POLICY "writer columns read" ON public.writer_columns FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: writer_drafts writer drafts read
CREATE POLICY "writer drafts read" ON public.writer_drafts FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- policy: writer_images writer images read
CREATE POLICY "writer images read" ON public.writer_images FOR SELECT USING (public.has_role(workspace_id, 'viewer'::public.ws_role));

-- row security: writer_briefs
ALTER TABLE public.writer_briefs ENABLE ROW LEVEL SECURITY;

-- row security: writer_cells
ALTER TABLE public.writer_cells ENABLE ROW LEVEL SECURITY;

-- row security: writer_columns
ALTER TABLE public.writer_columns ENABLE ROW LEVEL SECURITY;

-- row security: writer_drafts
ALTER TABLE public.writer_drafts ENABLE ROW LEVEL SECURITY;

-- row security: writer_images
ALTER TABLE public.writer_images ENABLE ROW LEVEL SECURITY;

-- policy: workspaces ws delete
CREATE POLICY "ws delete" ON public.workspaces FOR DELETE USING (public.has_role(id, 'owner'::public.ws_role));

-- policy: workspaces ws read
CREATE POLICY "ws read" ON public.workspaces FOR SELECT USING (public.has_role(id, 'viewer'::public.ws_role));

-- policy: workspaces ws rename
CREATE POLICY "ws rename" ON public.workspaces FOR UPDATE USING (public.has_role(id, 'admin'::public.ws_role)) WITH CHECK (public.has_role(id, 'admin'::public.ws_role));

-- policy: objects brand files add
CREATE POLICY "brand files add" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'brand-files'::text) AND public.has_role(((storage.foldername(name))[1])::uuid, 'editor'::public.ws_role)));

-- policy: objects brand files delete
CREATE POLICY "brand files delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'brand-files'::text) AND public.has_role(((storage.foldername(name))[1])::uuid, 'editor'::public.ws_role)));

-- policy: objects brand files read
CREATE POLICY "brand files read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'brand-files'::text) AND public.has_role(((storage.foldername(name))[1])::uuid, 'viewer'::public.ws_role)));

-- policy: objects doc images add
CREATE POLICY "doc images add" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'doc-images'::text) AND public.has_role(((storage.foldername(name))[1])::uuid, 'editor'::public.ws_role)));

-- policy: objects doc images delete
CREATE POLICY "doc images delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'doc-images'::text) AND public.has_role(((storage.foldername(name))[1])::uuid, 'editor'::public.ws_role)));

-- policy: objects doc images read
CREATE POLICY "doc images read" ON storage.objects FOR SELECT USING ((bucket_id = 'doc-images'::text));

-- acl: FUNCTION pg_reload_conf()
GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;

-- acl: FUNCTION accept_invite(p_token text)
GRANT ALL ON FUNCTION public.accept_invite(p_token text) TO anon;
GRANT ALL ON FUNCTION public.accept_invite(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_invite(p_token text) TO service_role;

-- acl: FUNCTION add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer)
REVOKE ALL ON FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) TO anon;
GRANT ALL ON FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) TO authenticated;
GRANT ALL ON FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) TO service_role;

-- acl: FUNCTION append_chat(p_run uuid, p_chat jsonb)
REVOKE ALL ON FUNCTION public.append_chat(p_run uuid, p_chat jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.append_chat(p_run uuid, p_chat jsonb) TO anon;
GRANT ALL ON FUNCTION public.append_chat(p_run uuid, p_chat jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.append_chat(p_run uuid, p_chat jsonb) TO service_role;

-- acl: FUNCTION apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone)
REVOKE ALL ON FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone) TO service_role;

-- acl: FUNCTION check_brand_limits()
GRANT ALL ON FUNCTION public.check_brand_limits() TO anon;
GRANT ALL ON FUNCTION public.check_brand_limits() TO authenticated;
GRANT ALL ON FUNCTION public.check_brand_limits() TO service_role;

-- acl: FUNCTION check_seats()
GRANT ALL ON FUNCTION public.check_seats() TO anon;
GRANT ALL ON FUNCTION public.check_seats() TO authenticated;
GRANT ALL ON FUNCTION public.check_seats() TO service_role;

-- acl: TABLE jobs
GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;

-- acl: FUNCTION claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[])
REVOKE ALL ON FUNCTION public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[]) TO anon;
GRANT ALL ON FUNCTION public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[]) TO authenticated;
GRANT ALL ON FUNCTION public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[]) TO service_role;

-- acl: FUNCTION cms_brand_matches()
GRANT ALL ON FUNCTION public.cms_brand_matches() TO anon;
GRANT ALL ON FUNCTION public.cms_brand_matches() TO authenticated;
GRANT ALL ON FUNCTION public.cms_brand_matches() TO service_role;

-- acl: FUNCTION create_workspace(p_name text)
GRANT ALL ON FUNCTION public.create_workspace(p_name text) TO anon;
GRANT ALL ON FUNCTION public.create_workspace(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_workspace(p_name text) TO service_role;

-- acl: FUNCTION doc_publication_matches()
GRANT ALL ON FUNCTION public.doc_publication_matches() TO anon;
GRANT ALL ON FUNCTION public.doc_publication_matches() TO authenticated;
GRANT ALL ON FUNCTION public.doc_publication_matches() TO service_role;

-- acl: FUNCTION enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer)
REVOKE ALL ON FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer) TO anon;
GRANT ALL ON FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer) TO service_role;

-- acl: FUNCTION finish_job(p_id bigint)
REVOKE ALL ON FUNCTION public.finish_job(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_job(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.finish_job(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.finish_job(p_id bigint) TO service_role;

-- acl: FUNCTION give_back(p_ws uuid, p_metric text, p_period text, p_n integer)
REVOKE ALL ON FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer) TO service_role;

-- acl: FUNCTION give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer)
REVOKE ALL ON FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) TO anon;
GRANT ALL ON FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) TO service_role;

-- acl: FUNCTION has_role(ws uuid, min public.ws_role)
GRANT ALL ON FUNCTION public.has_role(ws uuid, min public.ws_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(ws uuid, min public.ws_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(ws uuid, min public.ws_role) TO service_role;

-- acl: FUNCTION join_by_domain()
GRANT ALL ON FUNCTION public.join_by_domain() TO anon;
GRANT ALL ON FUNCTION public.join_by_domain() TO authenticated;
GRANT ALL ON FUNCTION public.join_by_domain() TO service_role;

-- acl: TABLE article_pages
GRANT ALL ON TABLE public.article_pages TO anon;
GRANT ALL ON TABLE public.article_pages TO authenticated;
GRANT ALL ON TABLE public.article_pages TO service_role;

-- acl: FUNCTION lease_article_page(p_worker text, p_lease_seconds integer)
REVOKE ALL ON FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer) TO service_role;

-- acl: TABLE writer_images
GRANT ALL ON TABLE public.writer_images TO anon;
GRANT ALL ON TABLE public.writer_images TO authenticated;
GRANT ALL ON TABLE public.writer_images TO service_role;

-- acl: FUNCTION lease_writer_image(p_worker text, p_lease_seconds integer)
REVOKE ALL ON FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer) TO service_role;

-- acl: FUNCTION lock_publication(p_id uuid, p_seconds integer)
REVOKE ALL ON FUNCTION public.lock_publication(p_id uuid, p_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lock_publication(p_id uuid, p_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.lock_publication(p_id uuid, p_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.lock_publication(p_id uuid, p_seconds integer) TO service_role;

-- acl: FUNCTION perception_summary(p_brand uuid, p_since timestamp with time zone)
GRANT ALL ON FUNCTION public.perception_summary(p_brand uuid, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.perception_summary(p_brand uuid, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.perception_summary(p_brand uuid, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION prune_jobs()
REVOKE ALL ON FUNCTION public.prune_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_jobs() TO anon;
GRANT ALL ON FUNCTION public.prune_jobs() TO authenticated;
GRANT ALL ON FUNCTION public.prune_jobs() TO service_role;

-- acl: FUNCTION report_link_viewed(p_token text)
REVOKE ALL ON FUNCTION public.report_link_viewed(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_link_viewed(p_token text) TO anon;
GRANT ALL ON FUNCTION public.report_link_viewed(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.report_link_viewed(p_token text) TO service_role;

-- acl: FUNCTION retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean)
REVOKE ALL ON FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean) TO anon;
GRANT ALL ON FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean) TO authenticated;
GRANT ALL ON FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean) TO service_role;

-- acl: FUNCTION role_rank(r public.ws_role)
GRANT ALL ON FUNCTION public.role_rank(r public.ws_role) TO anon;
GRANT ALL ON FUNCTION public.role_rank(r public.ws_role) TO authenticated;
GRANT ALL ON FUNCTION public.role_rank(r public.ws_role) TO service_role;

-- acl: FUNCTION run_brand_matches()
GRANT ALL ON FUNCTION public.run_brand_matches() TO anon;
GRANT ALL ON FUNCTION public.run_brand_matches() TO authenticated;
GRANT ALL ON FUNCTION public.run_brand_matches() TO service_role;

-- acl: FUNCTION take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer)
REVOKE ALL ON FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer) TO service_role;

-- acl: FUNCTION take_answer(p_ws uuid)
REVOKE ALL ON FUNCTION public.take_answer(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_answer(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.take_answer(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.take_answer(p_ws uuid) TO service_role;

-- acl: FUNCTION take_rate(p_key text, p_per_minute integer, p_n integer)
REVOKE ALL ON FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer) TO service_role;

-- acl: FUNCTION take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer)
REVOKE ALL ON FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) TO service_role;

-- acl: FUNCTION trial_from_signup()
GRANT ALL ON FUNCTION public.trial_from_signup() TO anon;
GRANT ALL ON FUNCTION public.trial_from_signup() TO authenticated;
GRANT ALL ON FUNCTION public.trial_from_signup() TO service_role;

-- acl: FUNCTION workspace_starter_kit()
GRANT ALL ON FUNCTION public.workspace_starter_kit() TO anon;
GRANT ALL ON FUNCTION public.workspace_starter_kit() TO authenticated;
GRANT ALL ON FUNCTION public.workspace_starter_kit() TO service_role;

-- acl: FUNCTION writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid)
REVOKE ALL ON FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid) TO service_role;

-- acl: TABLE answers
GRANT ALL ON TABLE public.answers TO anon;
GRANT ALL ON TABLE public.answers TO authenticated;
GRANT ALL ON TABLE public.answers TO service_role;

-- acl: SEQUENCE answers_id_seq
GRANT ALL ON SEQUENCE public.answers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.answers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.answers_id_seq TO service_role;

-- acl: TABLE api_keys
GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;

-- acl: TABLE article_ai_answers
GRANT ALL ON TABLE public.article_ai_answers TO anon;
GRANT ALL ON TABLE public.article_ai_answers TO authenticated;
GRANT ALL ON TABLE public.article_ai_answers TO service_role;

-- acl: SEQUENCE article_pages_id_seq
GRANT ALL ON SEQUENCE public.article_pages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.article_pages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.article_pages_id_seq TO service_role;

-- acl: TABLE article_runs
GRANT ALL ON TABLE public.article_runs TO anon;
GRANT ALL ON TABLE public.article_runs TO authenticated;
GRANT ALL ON TABLE public.article_runs TO service_role;

-- acl: TABLE article_serp
GRANT ALL ON TABLE public.article_serp TO anon;
GRANT ALL ON TABLE public.article_serp TO authenticated;
GRANT ALL ON TABLE public.article_serp TO service_role;

-- acl: TABLE ask_knowledge
GRANT ALL ON TABLE public.ask_knowledge TO anon;
GRANT ALL ON TABLE public.ask_knowledge TO authenticated;
GRANT ALL ON TABLE public.ask_knowledge TO service_role;

-- acl: TABLE ask_messages
GRANT ALL ON TABLE public.ask_messages TO anon;
GRANT ALL ON TABLE public.ask_messages TO authenticated;
GRANT ALL ON TABLE public.ask_messages TO service_role;

-- acl: SEQUENCE ask_messages_id_seq
GRANT ALL ON SEQUENCE public.ask_messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ask_messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ask_messages_id_seq TO service_role;

-- acl: TABLE ask_projects
GRANT ALL ON TABLE public.ask_projects TO anon;
GRANT ALL ON TABLE public.ask_projects TO authenticated;
GRANT ALL ON TABLE public.ask_projects TO service_role;

-- acl: TABLE ask_skills
GRANT ALL ON TABLE public.ask_skills TO anon;
GRANT ALL ON TABLE public.ask_skills TO authenticated;
GRANT ALL ON TABLE public.ask_skills TO service_role;

-- acl: TABLE ask_threads
GRANT ALL ON TABLE public.ask_threads TO anon;
GRANT ALL ON TABLE public.ask_threads TO authenticated;
GRANT ALL ON TABLE public.ask_threads TO service_role;

-- acl: TABLE brand_guidelines
GRANT ALL ON TABLE public.brand_guidelines TO anon;
GRANT ALL ON TABLE public.brand_guidelines TO authenticated;
GRANT ALL ON TABLE public.brand_guidelines TO service_role;

-- acl: TABLE brand_kits
GRANT ALL ON TABLE public.brand_kits TO anon;
GRANT ALL ON TABLE public.brand_kits TO authenticated;
GRANT ALL ON TABLE public.brand_kits TO service_role;

-- acl: TABLE brand_settings
GRANT ALL ON TABLE public.brand_settings TO anon;
GRANT ALL ON TABLE public.brand_settings TO authenticated;
GRANT ALL ON TABLE public.brand_settings TO service_role;

-- acl: TABLE brand_voices
GRANT ALL ON TABLE public.brand_voices TO anon;
GRANT ALL ON TABLE public.brand_voices TO authenticated;
GRANT ALL ON TABLE public.brand_voices TO service_role;

-- acl: TABLE brands
GRANT ALL ON TABLE public.brands TO anon;
GRANT ALL ON TABLE public.brands TO authenticated;
GRANT ALL ON TABLE public.brands TO service_role;

-- acl: TABLE bulk_runs
GRANT ALL ON TABLE public.bulk_runs TO anon;
GRANT ALL ON TABLE public.bulk_runs TO authenticated;
GRANT ALL ON TABLE public.bulk_runs TO service_role;

-- acl: TABLE calendar_items
GRANT ALL ON TABLE public.calendar_items TO anon;
GRANT ALL ON TABLE public.calendar_items TO authenticated;
GRANT ALL ON TABLE public.calendar_items TO service_role;

-- acl: TABLE change_sets
GRANT ALL ON TABLE public.change_sets TO anon;
GRANT ALL ON TABLE public.change_sets TO authenticated;
GRANT ALL ON TABLE public.change_sets TO service_role;

-- acl: TABLE changes
GRANT ALL ON TABLE public.changes TO anon;
GRANT ALL ON TABLE public.changes TO authenticated;
GRANT ALL ON TABLE public.changes TO service_role;

-- acl: SEQUENCE changes_id_seq
GRANT ALL ON SEQUENCE public.changes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.changes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.changes_id_seq TO service_role;

-- acl: TABLE cms_connections
GRANT ALL ON TABLE public.cms_connections TO anon;
GRANT ALL ON TABLE public.cms_connections TO authenticated;
GRANT ALL ON TABLE public.cms_connections TO service_role;

-- acl: TABLE cost_ledger
GRANT ALL ON TABLE public.cost_ledger TO anon;
GRANT ALL ON TABLE public.cost_ledger TO authenticated;
GRANT ALL ON TABLE public.cost_ledger TO service_role;

-- acl: TABLE workspaces
GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;

-- acl: COLUMN workspaces.name
GRANT UPDATE(name) ON TABLE public.workspaces TO authenticated;

-- acl: TABLE cost_by_workspace
GRANT ALL ON TABLE public.cost_by_workspace TO anon;
GRANT ALL ON TABLE public.cost_by_workspace TO authenticated;
GRANT ALL ON TABLE public.cost_by_workspace TO service_role;

-- acl: SEQUENCE cost_ledger_id_seq
GRANT ALL ON SEQUENCE public.cost_ledger_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cost_ledger_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cost_ledger_id_seq TO service_role;

-- acl: TABLE daily_metrics
GRANT ALL ON TABLE public.daily_metrics TO anon;
GRANT ALL ON TABLE public.daily_metrics TO authenticated;
GRANT ALL ON TABLE public.daily_metrics TO service_role;

-- acl: TABLE doc_publications
GRANT ALL ON TABLE public.doc_publications TO anon;
GRANT ALL ON TABLE public.doc_publications TO authenticated;
GRANT ALL ON TABLE public.doc_publications TO service_role;

-- acl: TABLE doc_versions
GRANT ALL ON TABLE public.doc_versions TO anon;
GRANT ALL ON TABLE public.doc_versions TO authenticated;
GRANT ALL ON TABLE public.doc_versions TO service_role;

-- acl: TABLE docs
GRANT ALL ON TABLE public.docs TO anon;
GRANT ALL ON TABLE public.docs TO authenticated;
GRANT ALL ON TABLE public.docs TO service_role;

-- acl: TABLE email_log
GRANT ALL ON TABLE public.email_log TO anon;
GRANT ALL ON TABLE public.email_log TO authenticated;
GRANT ALL ON TABLE public.email_log TO service_role;

-- acl: TABLE free_runs
GRANT ALL ON TABLE public.free_runs TO anon;
GRANT ALL ON TABLE public.free_runs TO authenticated;
GRANT ALL ON TABLE public.free_runs TO service_role;

-- acl: SEQUENCE free_runs_id_seq
GRANT ALL ON SEQUENCE public.free_runs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.free_runs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.free_runs_id_seq TO service_role;

-- acl: TABLE ga4_connections
GRANT ALL ON TABLE public.ga4_connections TO anon;
GRANT ALL ON TABLE public.ga4_connections TO authenticated;
GRANT ALL ON TABLE public.ga4_connections TO service_role;

-- acl: TABLE gsc_connections
GRANT ALL ON TABLE public.gsc_connections TO anon;
GRANT ALL ON TABLE public.gsc_connections TO authenticated;
GRANT ALL ON TABLE public.gsc_connections TO service_role;

-- acl: TABLE industry_research
GRANT ALL ON TABLE public.industry_research TO anon;
GRANT ALL ON TABLE public.industry_research TO authenticated;
GRANT ALL ON TABLE public.industry_research TO service_role;

-- acl: TABLE integrations
GRANT ALL ON TABLE public.integrations TO anon;
GRANT ALL ON TABLE public.integrations TO authenticated;
GRANT ALL ON TABLE public.integrations TO service_role;

-- acl: SEQUENCE jobs_id_seq
GRANT ALL ON SEQUENCE public.jobs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.jobs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.jobs_id_seq TO service_role;

-- acl: TABLE keyword_cache
GRANT ALL ON TABLE public.keyword_cache TO anon;
GRANT ALL ON TABLE public.keyword_cache TO authenticated;
GRANT ALL ON TABLE public.keyword_cache TO service_role;

-- acl: TABLE keyword_runs
GRANT ALL ON TABLE public.keyword_runs TO anon;
GRANT ALL ON TABLE public.keyword_runs TO authenticated;
GRANT ALL ON TABLE public.keyword_runs TO service_role;

-- acl: TABLE mentions
GRANT ALL ON TABLE public.mentions TO anon;
GRANT ALL ON TABLE public.mentions TO authenticated;
GRANT ALL ON TABLE public.mentions TO service_role;

-- acl: SEQUENCE mentions_id_seq
GRANT ALL ON SEQUENCE public.mentions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.mentions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.mentions_id_seq TO service_role;

-- acl: TABLE notification_prefs
GRANT ALL ON TABLE public.notification_prefs TO anon;
GRANT ALL ON TABLE public.notification_prefs TO authenticated;
GRANT ALL ON TABLE public.notification_prefs TO service_role;

-- acl: TABLE oauth_clients
GRANT ALL ON TABLE public.oauth_clients TO anon;
GRANT ALL ON TABLE public.oauth_clients TO authenticated;
GRANT ALL ON TABLE public.oauth_clients TO service_role;

-- acl: TABLE oauth_codes
GRANT ALL ON TABLE public.oauth_codes TO anon;
GRANT ALL ON TABLE public.oauth_codes TO authenticated;
GRANT ALL ON TABLE public.oauth_codes TO service_role;

-- acl: TABLE outreach_lists
GRANT ALL ON TABLE public.outreach_lists TO anon;
GRANT ALL ON TABLE public.outreach_lists TO authenticated;
GRANT ALL ON TABLE public.outreach_lists TO service_role;

-- acl: TABLE outreach_suppression
GRANT ALL ON TABLE public.outreach_suppression TO anon;
GRANT ALL ON TABLE public.outreach_suppression TO authenticated;
GRANT ALL ON TABLE public.outreach_suppression TO service_role;

-- acl: TABLE outreach_targets
GRANT ALL ON TABLE public.outreach_targets TO anon;
GRANT ALL ON TABLE public.outreach_targets TO authenticated;
GRANT ALL ON TABLE public.outreach_targets TO service_role;

-- acl: TABLE perception_reads
GRANT ALL ON TABLE public.perception_reads TO anon;
GRANT ALL ON TABLE public.perception_reads TO authenticated;
GRANT ALL ON TABLE public.perception_reads TO service_role;

-- acl: SEQUENCE perception_reads_id_seq
GRANT ALL ON SEQUENCE public.perception_reads_id_seq TO anon;
GRANT ALL ON SEQUENCE public.perception_reads_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.perception_reads_id_seq TO service_role;

-- acl: TABLE profiles
GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- acl: TABLE rate_buckets
GRANT ALL ON TABLE public.rate_buckets TO anon;
GRANT ALL ON TABLE public.rate_buckets TO authenticated;
GRANT ALL ON TABLE public.rate_buckets TO service_role;

-- acl: TABLE report_files
GRANT ALL ON TABLE public.report_files TO anon;
GRANT ALL ON TABLE public.report_files TO authenticated;
GRANT ALL ON TABLE public.report_files TO service_role;

-- acl: TABLE report_links
GRANT ALL ON TABLE public.report_links TO anon;
GRANT ALL ON TABLE public.report_links TO authenticated;
GRANT ALL ON TABLE public.report_links TO service_role;

-- acl: TABLE report_schedules
GRANT ALL ON TABLE public.report_schedules TO anon;
GRANT ALL ON TABLE public.report_schedules TO authenticated;
GRANT ALL ON TABLE public.report_schedules TO service_role;

-- acl: TABLE report_sends
GRANT ALL ON TABLE public.report_sends TO anon;
GRANT ALL ON TABLE public.report_sends TO authenticated;
GRANT ALL ON TABLE public.report_sends TO service_role;

-- acl: TABLE report_styles
GRANT ALL ON TABLE public.report_styles TO anon;
GRANT ALL ON TABLE public.report_styles TO authenticated;
GRANT ALL ON TABLE public.report_styles TO service_role;

-- acl: TABLE report_versions
GRANT ALL ON TABLE public.report_versions TO anon;
GRANT ALL ON TABLE public.report_versions TO authenticated;
GRANT ALL ON TABLE public.report_versions TO service_role;

-- acl: TABLE reports
GRANT ALL ON TABLE public.reports TO anon;
GRANT ALL ON TABLE public.reports TO authenticated;
GRANT ALL ON TABLE public.reports TO service_role;

-- acl: TABLE runs
GRANT ALL ON TABLE public.runs TO anon;
GRANT ALL ON TABLE public.runs TO authenticated;
GRANT ALL ON TABLE public.runs TO service_role;

-- acl: TABLE shared_answers
GRANT ALL ON TABLE public.shared_answers TO anon;
GRANT ALL ON TABLE public.shared_answers TO authenticated;
GRANT ALL ON TABLE public.shared_answers TO service_role;

-- acl: TABLE shared_reports
GRANT ALL ON TABLE public.shared_reports TO anon;
GRANT ALL ON TABLE public.shared_reports TO authenticated;
GRANT ALL ON TABLE public.shared_reports TO service_role;

-- acl: TABLE site_audits
GRANT ALL ON TABLE public.site_audits TO anon;
GRANT ALL ON TABLE public.site_audits TO authenticated;
GRANT ALL ON TABLE public.site_audits TO service_role;

-- acl: TABLE sites
GRANT ALL ON TABLE public.sites TO anon;
GRANT ALL ON TABLE public.sites TO authenticated;
GRANT ALL ON TABLE public.sites TO service_role;

-- acl: TABLE snapshots
GRANT ALL ON TABLE public.snapshots TO anon;
GRANT ALL ON TABLE public.snapshots TO authenticated;
GRANT ALL ON TABLE public.snapshots TO service_role;

-- acl: SEQUENCE snapshots_id_seq
GRANT ALL ON SEQUENCE public.snapshots_id_seq TO anon;
GRANT ALL ON SEQUENCE public.snapshots_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.snapshots_id_seq TO service_role;

-- acl: TABLE stripe_events
GRANT ALL ON TABLE public.stripe_events TO anon;
GRANT ALL ON TABLE public.stripe_events TO authenticated;
GRANT ALL ON TABLE public.stripe_events TO service_role;

-- acl: TABLE task_purchases
GRANT ALL ON TABLE public.task_purchases TO anon;
GRANT ALL ON TABLE public.task_purchases TO authenticated;
GRANT ALL ON TABLE public.task_purchases TO service_role;

-- acl: TABLE usage
GRANT ALL ON TABLE public.usage TO anon;
GRANT ALL ON TABLE public.usage TO authenticated;
GRANT ALL ON TABLE public.usage TO service_role;

-- acl: TABLE usage_counters
GRANT ALL ON TABLE public.usage_counters TO anon;
GRANT ALL ON TABLE public.usage_counters TO authenticated;
GRANT ALL ON TABLE public.usage_counters TO service_role;

-- acl: TABLE webhooks
GRANT ALL ON TABLE public.webhooks TO anon;
GRANT ALL ON TABLE public.webhooks TO authenticated;
GRANT ALL ON TABLE public.webhooks TO service_role;

-- acl: TABLE workspace_invites
GRANT ALL ON TABLE public.workspace_invites TO anon;
GRANT ALL ON TABLE public.workspace_invites TO authenticated;
GRANT ALL ON TABLE public.workspace_invites TO service_role;

-- acl: TABLE workspace_members
GRANT ALL ON TABLE public.workspace_members TO anon;
GRANT ALL ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;

-- acl: TABLE writer_briefs
GRANT ALL ON TABLE public.writer_briefs TO anon;
GRANT ALL ON TABLE public.writer_briefs TO authenticated;
GRANT ALL ON TABLE public.writer_briefs TO service_role;

-- acl: TABLE writer_cells
GRANT ALL ON TABLE public.writer_cells TO anon;
GRANT ALL ON TABLE public.writer_cells TO authenticated;
GRANT ALL ON TABLE public.writer_cells TO service_role;

-- acl: TABLE writer_columns
GRANT ALL ON TABLE public.writer_columns TO anon;
GRANT ALL ON TABLE public.writer_columns TO authenticated;
GRANT ALL ON TABLE public.writer_columns TO service_role;

-- acl: TABLE writer_drafts
GRANT ALL ON TABLE public.writer_drafts TO anon;
GRANT ALL ON TABLE public.writer_drafts TO authenticated;
GRANT ALL ON TABLE public.writer_drafts TO service_role;

-- acl: SEQUENCE writer_images_id_seq
GRANT ALL ON SEQUENCE public.writer_images_id_seq TO anon;
GRANT ALL ON SEQUENCE public.writer_images_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.writer_images_id_seq TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;
