-- arrowsterr: keys indexes. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- index: answers_prompt_idx
CREATE INDEX answers_prompt_idx ON public.answers USING btree (brand_id, prompt, at DESC);

-- index: api_keys_ws
CREATE INDEX api_keys_ws ON public.api_keys USING btree (workspace_id);

-- index: article_pages_lease_idx
CREATE INDEX article_pages_lease_idx ON public.article_pages USING btree (locked_until) WHERE (status = 'rendering'::text);

-- index: article_pages_ready_idx
CREATE INDEX article_pages_ready_idx ON public.article_pages USING btree (created_at) WHERE (status = 'queued'::text);

-- index: article_runs_item_idx
CREATE INDEX article_runs_item_idx ON public.article_runs USING btree (item_id, created_at DESC);

-- index: article_runs_open_idx
CREATE UNIQUE INDEX article_runs_open_idx ON public.article_runs USING btree (item_id) WHERE (status = ANY (ARRAY['queued'::text, 'searching'::text, 'reading'::text, 'waiting'::text]));

-- index: ask_knowledge_ws
CREATE INDEX ask_knowledge_ws ON public.ask_knowledge USING btree (workspace_id, created_at DESC);

-- index: ask_messages_thread
CREATE INDEX ask_messages_thread ON public.ask_messages USING btree (thread_id, id);

-- index: ask_projects_ws
CREATE INDEX ask_projects_ws ON public.ask_projects USING btree (workspace_id, updated_at DESC);

-- index: ask_skills_ws
CREATE INDEX ask_skills_ws ON public.ask_skills USING btree (workspace_id);

-- index: ask_threads_project
CREATE INDEX ask_threads_project ON public.ask_threads USING btree (project_id, updated_at DESC);

-- index: ask_threads_ws
CREATE INDEX ask_threads_ws ON public.ask_threads USING btree (workspace_id, updated_at DESC);

-- index: brand_guidelines_ws
CREATE INDEX brand_guidelines_ws ON public.brand_guidelines USING btree (workspace_id);

-- index: brand_settings_ws
CREATE INDEX brand_settings_ws ON public.brand_settings USING btree (workspace_id);

-- index: brand_voices_ws
CREATE INDEX brand_voices_ws ON public.brand_voices USING btree (workspace_id);

-- index: brands_workspace_idx
CREATE INDEX brands_workspace_idx ON public.brands USING btree (workspace_id);

-- index: bulk_runs_recent
CREATE INDEX bulk_runs_recent ON public.bulk_runs USING btree (site_id, kind, created_at DESC);

-- index: calendar_items_library_idx
CREATE INDEX calendar_items_library_idx ON public.calendar_items USING btree (site_id, library_at) WHERE (library_at IS NOT NULL);

-- index: calendar_items_site_idx
CREATE INDEX calendar_items_site_idx ON public.calendar_items USING btree (site_id, due_date);

-- index: change_sets_ws
CREATE INDEX change_sets_ws ON public.change_sets USING btree (workspace_id, created_at DESC);

-- index: changes_set
CREATE INDEX changes_set ON public.changes USING btree (change_set_id, id);

-- index: cms_connections_brand
CREATE INDEX cms_connections_brand ON public.cms_connections USING btree (brand_id);

-- index: cms_connections_ws
CREATE INDEX cms_connections_ws ON public.cms_connections USING btree (workspace_id);

-- index: cost_ledger_ws_at_idx
CREATE INDEX cost_ledger_ws_at_idx ON public.cost_ledger USING btree (workspace_id, at DESC);

-- index: daily_metrics_brand_day_idx
CREATE INDEX daily_metrics_brand_day_idx ON public.daily_metrics USING btree (brand_id, day);

-- index: doc_publications_conn
CREATE INDEX doc_publications_conn ON public.doc_publications USING btree (connection_id);

-- index: doc_publications_ws
CREATE INDEX doc_publications_ws ON public.doc_publications USING btree (workspace_id);

-- index: doc_versions_doc_idx
CREATE INDEX doc_versions_doc_idx ON public.doc_versions USING btree (doc_id, created_at DESC);

-- index: docs_site_idx
CREATE INDEX docs_site_idx ON public.docs USING btree (site_id, updated_at DESC);

-- index: free_runs_day_idx
CREATE INDEX free_runs_day_idx ON public.free_runs USING btree (created_at DESC);

-- index: free_runs_lookup_idx
CREATE INDEX free_runs_lookup_idx ON public.free_runs USING btree (tool, key, created_at DESC);

-- index: free_runs_visitor_idx
CREATE INDEX free_runs_visitor_idx ON public.free_runs USING btree (ip_hash, created_at DESC);

-- index: jobs_kind_idx
CREATE INDEX jobs_kind_idx ON public.jobs USING btree (kind, status);

-- index: jobs_lease_idx
CREATE INDEX jobs_lease_idx ON public.jobs USING btree (locked_until) WHERE (status = 'running'::text);

-- index: jobs_ready_idx
CREATE INDEX jobs_ready_idx ON public.jobs USING btree (run_at) WHERE (status = 'queued'::text);

-- index: keyword_runs_site_idx
CREATE INDEX keyword_runs_site_idx ON public.keyword_runs USING btree (site_id, created_at DESC);

-- index: mentions_brand_found
CREATE INDEX mentions_brand_found ON public.mentions USING btree (brand_id, found_at DESC);

-- index: outreach_lists_ws
CREATE INDEX outreach_lists_ws ON public.outreach_lists USING btree (workspace_id, created_at DESC);

-- index: outreach_targets_list
CREATE INDEX outreach_targets_list ON public.outreach_targets USING btree (list_id, created_at);

-- index: perception_reads_brand_idx
CREATE INDEX perception_reads_brand_idx ON public.perception_reads USING btree (brand_id, at DESC);

-- index: perception_reads_buyer_key
CREATE UNIQUE INDEX perception_reads_buyer_key ON public.perception_reads USING btree (run_id, engine, prompt, named) WHERE (source = 'buyer'::text);

-- index: report_files_workspace_idx
CREATE INDEX report_files_workspace_idx ON public.report_files USING btree (workspace_id, created_at DESC);

-- index: report_links_report_idx
CREATE INDEX report_links_report_idx ON public.report_links USING btree (report_id, created_at DESC);

-- index: report_links_workspace_idx
CREATE INDEX report_links_workspace_idx ON public.report_links USING btree (workspace_id, created_at DESC);

-- index: report_schedules_due_idx
CREATE INDEX report_schedules_due_idx ON public.report_schedules USING btree (next_run_at) WHERE active;

-- index: report_sends_schedule_idx
CREATE INDEX report_sends_schedule_idx ON public.report_sends USING btree (schedule_id, due_at DESC);

-- index: report_versions_report_idx
CREATE INDEX report_versions_report_idx ON public.report_versions USING btree (report_id, created_at DESC);

-- index: reports_brand_idx
CREATE INDEX reports_brand_idx ON public.reports USING btree (brand_id);

-- index: reports_workspace_idx
CREATE INDEX reports_workspace_idx ON public.reports USING btree (workspace_id, updated_at DESC);

-- index: runs_brand_at_idx
CREATE INDEX runs_brand_at_idx ON public.runs USING btree (brand_id, at);

-- index: runs_daily_idx
CREATE INDEX runs_daily_idx ON public.runs USING btree (status, at) WHERE (source = 'daily'::text);

-- index: runs_perception_idx
CREATE INDEX runs_perception_idx ON public.runs USING btree (at) WHERE (perception_read = 0);

-- index: shared_answers_day_idx
CREATE INDEX shared_answers_day_idx ON public.shared_answers USING btree (day);

-- index: shared_reports_brand_idx
CREATE INDEX shared_reports_brand_idx ON public.shared_reports USING btree (brand_id, created_at DESC);

-- index: site_audits_ws
CREATE INDEX site_audits_ws ON public.site_audits USING btree (workspace_id, created_at DESC);

-- index: snapshots_domain
CREATE INDEX snapshots_domain ON public.snapshots USING btree (domain, created_at DESC);

-- index: snapshots_ip
CREATE INDEX snapshots_ip ON public.snapshots USING btree (ip_hash, created_at DESC);

-- index: webhooks_ws
CREATE INDEX webhooks_ws ON public.webhooks USING btree (workspace_id);

-- index: workspace_members_user_idx
CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);

-- index: workspaces_stripe_customer_idx
CREATE INDEX workspaces_stripe_customer_idx ON public.workspaces USING btree (stripe_customer_id);

-- index: workspaces_stripe_sub_idx
CREATE UNIQUE INDEX workspaces_stripe_sub_idx ON public.workspaces USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);

-- index: writer_briefs_brand_idx
CREATE INDEX writer_briefs_brand_idx ON public.writer_briefs USING btree (brand_id, updated_at DESC);

-- index: writer_briefs_site_idx
CREATE INDEX writer_briefs_site_idx ON public.writer_briefs USING btree (site_id, updated_at DESC);

-- index: writer_columns_site_idx
CREATE INDEX writer_columns_site_idx ON public.writer_columns USING btree (site_id, "position");

-- index: writer_drafts_quota_idx
CREATE INDEX writer_drafts_quota_idx ON public.writer_drafts USING btree (brand_id, period);

-- index: writer_drafts_site_idx
CREATE INDEX writer_drafts_site_idx ON public.writer_drafts USING btree (site_id, updated_at DESC);

-- index: writer_images_lease_idx
CREATE INDEX writer_images_lease_idx ON public.writer_images USING btree (locked_until) WHERE (status = 'working'::text);

-- index: writer_images_ready_idx
CREATE INDEX writer_images_ready_idx ON public.writer_images USING btree (created_at) WHERE (status = 'queued'::text);

-- fk constraint: answers answers_brand_id_fkey
ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: answers answers_run_id_fkey
ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;

-- fk constraint: answers answers_workspace_id_fkey
ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: api_keys api_keys_client_id_fkey
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id) ON DELETE SET NULL;

-- fk constraint: api_keys api_keys_created_by_fkey
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: api_keys api_keys_workspace_id_fkey
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: article_ai_answers article_ai_answers_run_id_fkey
ALTER TABLE ONLY public.article_ai_answers
    ADD CONSTRAINT article_ai_answers_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.article_runs(id) ON DELETE CASCADE;

-- fk constraint: article_pages article_pages_run_id_fkey
ALTER TABLE ONLY public.article_pages
    ADD CONSTRAINT article_pages_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.article_runs(id) ON DELETE CASCADE;

-- fk constraint: article_runs article_runs_brand_id_fkey
ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;

-- fk constraint: article_runs article_runs_created_by_fkey
ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: article_runs article_runs_item_id_fkey
ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.calendar_items(id) ON DELETE CASCADE;

-- fk constraint: article_runs article_runs_site_id_fkey
ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: article_runs article_runs_workspace_id_fkey
ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: article_serp article_serp_run_id_fkey
ALTER TABLE ONLY public.article_serp
    ADD CONSTRAINT article_serp_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.article_runs(id) ON DELETE CASCADE;

-- fk constraint: ask_knowledge ask_knowledge_created_by_fkey
ALTER TABLE ONLY public.ask_knowledge
    ADD CONSTRAINT ask_knowledge_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: ask_knowledge ask_knowledge_project_id_fkey
ALTER TABLE ONLY public.ask_knowledge
    ADD CONSTRAINT ask_knowledge_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.ask_projects(id) ON DELETE CASCADE;

-- fk constraint: ask_knowledge ask_knowledge_workspace_id_fkey
ALTER TABLE ONLY public.ask_knowledge
    ADD CONSTRAINT ask_knowledge_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ask_messages ask_messages_thread_id_fkey
ALTER TABLE ONLY public.ask_messages
    ADD CONSTRAINT ask_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.ask_threads(id) ON DELETE CASCADE;

-- fk constraint: ask_messages ask_messages_workspace_id_fkey
ALTER TABLE ONLY public.ask_messages
    ADD CONSTRAINT ask_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ask_projects ask_projects_created_by_fkey
ALTER TABLE ONLY public.ask_projects
    ADD CONSTRAINT ask_projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: ask_projects ask_projects_workspace_id_fkey
ALTER TABLE ONLY public.ask_projects
    ADD CONSTRAINT ask_projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ask_skills ask_skills_created_by_fkey
ALTER TABLE ONLY public.ask_skills
    ADD CONSTRAINT ask_skills_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: ask_skills ask_skills_workspace_id_fkey
ALTER TABLE ONLY public.ask_skills
    ADD CONSTRAINT ask_skills_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ask_threads ask_threads_created_by_fkey
ALTER TABLE ONLY public.ask_threads
    ADD CONSTRAINT ask_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: ask_threads ask_threads_project_id_fkey
ALTER TABLE ONLY public.ask_threads
    ADD CONSTRAINT ask_threads_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.ask_projects(id) ON DELETE SET NULL;

-- fk constraint: ask_threads ask_threads_workspace_id_fkey
ALTER TABLE ONLY public.ask_threads
    ADD CONSTRAINT ask_threads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brand_guidelines brand_guidelines_brand_id_fkey
ALTER TABLE ONLY public.brand_guidelines
    ADD CONSTRAINT brand_guidelines_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: brand_guidelines brand_guidelines_workspace_id_fkey
ALTER TABLE ONLY public.brand_guidelines
    ADD CONSTRAINT brand_guidelines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brand_kits brand_kits_brand_id_fkey
ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: brand_kits brand_kits_updated_by_fkey
ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: brand_kits brand_kits_workspace_id_fkey
ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brand_settings brand_settings_brand_id_fkey
ALTER TABLE ONLY public.brand_settings
    ADD CONSTRAINT brand_settings_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: brand_settings brand_settings_workspace_id_fkey
ALTER TABLE ONLY public.brand_settings
    ADD CONSTRAINT brand_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brand_voices brand_voices_brand_id_fkey
ALTER TABLE ONLY public.brand_voices
    ADD CONSTRAINT brand_voices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: brand_voices brand_voices_updated_by_fkey
ALTER TABLE ONLY public.brand_voices
    ADD CONSTRAINT brand_voices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: brand_voices brand_voices_workspace_id_fkey
ALTER TABLE ONLY public.brand_voices
    ADD CONSTRAINT brand_voices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brands brands_workspace_id_fkey
ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: bulk_runs bulk_runs_created_by_fkey
ALTER TABLE ONLY public.bulk_runs
    ADD CONSTRAINT bulk_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: bulk_runs bulk_runs_site_id_fkey
ALTER TABLE ONLY public.bulk_runs
    ADD CONSTRAINT bulk_runs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: bulk_runs bulk_runs_workspace_id_fkey
ALTER TABLE ONLY public.bulk_runs
    ADD CONSTRAINT bulk_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: calendar_items calendar_items_created_by_fkey
ALTER TABLE ONLY public.calendar_items
    ADD CONSTRAINT calendar_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: calendar_items calendar_items_site_id_fkey
ALTER TABLE ONLY public.calendar_items
    ADD CONSTRAINT calendar_items_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: calendar_items calendar_items_workspace_id_fkey
ALTER TABLE ONLY public.calendar_items
    ADD CONSTRAINT calendar_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: change_sets change_sets_applied_by_fkey
ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: change_sets change_sets_connection_id_fkey
ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.cms_connections(id) ON DELETE SET NULL;

-- fk constraint: change_sets change_sets_created_by_fkey
ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: change_sets change_sets_thread_id_fkey
ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.ask_threads(id) ON DELETE SET NULL;

-- fk constraint: change_sets change_sets_workspace_id_fkey
ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: changes changes_change_set_id_fkey
ALTER TABLE ONLY public.changes
    ADD CONSTRAINT changes_change_set_id_fkey FOREIGN KEY (change_set_id) REFERENCES public.change_sets(id) ON DELETE CASCADE;

-- fk constraint: changes changes_workspace_id_fkey
ALTER TABLE ONLY public.changes
    ADD CONSTRAINT changes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: cms_connections cms_connections_brand_id_fkey
ALTER TABLE ONLY public.cms_connections
    ADD CONSTRAINT cms_connections_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: cms_connections cms_connections_workspace_id_fkey
ALTER TABLE ONLY public.cms_connections
    ADD CONSTRAINT cms_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: cost_ledger cost_ledger_workspace_id_fkey
ALTER TABLE ONLY public.cost_ledger
    ADD CONSTRAINT cost_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: daily_metrics daily_metrics_brand_id_fkey
ALTER TABLE ONLY public.daily_metrics
    ADD CONSTRAINT daily_metrics_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: daily_metrics daily_metrics_workspace_id_fkey
ALTER TABLE ONLY public.daily_metrics
    ADD CONSTRAINT daily_metrics_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: doc_publications doc_publications_connection_id_fkey
ALTER TABLE ONLY public.doc_publications
    ADD CONSTRAINT doc_publications_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.cms_connections(id) ON DELETE CASCADE;

-- fk constraint: doc_publications doc_publications_doc_id_fkey
ALTER TABLE ONLY public.doc_publications
    ADD CONSTRAINT doc_publications_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.docs(id) ON DELETE CASCADE;

-- fk constraint: doc_publications doc_publications_workspace_id_fkey
ALTER TABLE ONLY public.doc_publications
    ADD CONSTRAINT doc_publications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: doc_versions doc_versions_created_by_fkey
ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: doc_versions doc_versions_doc_id_fkey
ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.docs(id) ON DELETE CASCADE;

-- fk constraint: doc_versions doc_versions_workspace_id_fkey
ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: docs docs_calendar_item_id_fkey
ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_calendar_item_id_fkey FOREIGN KEY (calendar_item_id) REFERENCES public.calendar_items(id) ON DELETE SET NULL;

-- fk constraint: docs docs_created_by_fkey
ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: docs docs_site_id_fkey
ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: docs docs_workspace_id_fkey
ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_log email_log_workspace_id_fkey
ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ga4_connections ga4_connections_brand_id_fkey
ALTER TABLE ONLY public.ga4_connections
    ADD CONSTRAINT ga4_connections_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: ga4_connections ga4_connections_connected_by_fkey
ALTER TABLE ONLY public.ga4_connections
    ADD CONSTRAINT ga4_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: ga4_connections ga4_connections_workspace_id_fkey
ALTER TABLE ONLY public.ga4_connections
    ADD CONSTRAINT ga4_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: gsc_connections gsc_connections_connected_by_fkey
ALTER TABLE ONLY public.gsc_connections
    ADD CONSTRAINT gsc_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: gsc_connections gsc_connections_site_id_fkey
ALTER TABLE ONLY public.gsc_connections
    ADD CONSTRAINT gsc_connections_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: gsc_connections gsc_connections_workspace_id_fkey
ALTER TABLE ONLY public.gsc_connections
    ADD CONSTRAINT gsc_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: industry_research industry_research_brand_id_fkey
ALTER TABLE ONLY public.industry_research
    ADD CONSTRAINT industry_research_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: industry_research industry_research_workspace_id_fkey
ALTER TABLE ONLY public.industry_research
    ADD CONSTRAINT industry_research_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: integrations integrations_workspace_id_fkey
ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: jobs jobs_workspace_id_fkey
ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: keyword_runs keyword_runs_created_by_fkey
ALTER TABLE ONLY public.keyword_runs
    ADD CONSTRAINT keyword_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: keyword_runs keyword_runs_site_id_fkey
ALTER TABLE ONLY public.keyword_runs
    ADD CONSTRAINT keyword_runs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: keyword_runs keyword_runs_workspace_id_fkey
ALTER TABLE ONLY public.keyword_runs
    ADD CONSTRAINT keyword_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: mentions mentions_brand_id_fkey
ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: mentions mentions_workspace_id_fkey
ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: notification_prefs notification_prefs_user_id_fkey
ALTER TABLE ONLY public.notification_prefs
    ADD CONSTRAINT notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: notification_prefs notification_prefs_workspace_id_fkey
ALTER TABLE ONLY public.notification_prefs
    ADD CONSTRAINT notification_prefs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: oauth_codes oauth_codes_client_id_fkey
ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id) ON DELETE CASCADE;

-- fk constraint: oauth_codes oauth_codes_user_id_fkey
ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: oauth_codes oauth_codes_workspace_id_fkey
ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: outreach_lists outreach_lists_brand_id_fkey
ALTER TABLE ONLY public.outreach_lists
    ADD CONSTRAINT outreach_lists_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;

-- fk constraint: outreach_lists outreach_lists_created_by_fkey
ALTER TABLE ONLY public.outreach_lists
    ADD CONSTRAINT outreach_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: outreach_lists outreach_lists_workspace_id_fkey
ALTER TABLE ONLY public.outreach_lists
    ADD CONSTRAINT outreach_lists_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: outreach_suppression outreach_suppression_workspace_id_fkey
ALTER TABLE ONLY public.outreach_suppression
    ADD CONSTRAINT outreach_suppression_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: outreach_targets outreach_targets_list_id_fkey
ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.outreach_lists(id) ON DELETE CASCADE;

-- fk constraint: outreach_targets outreach_targets_workspace_id_fkey
ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: perception_reads perception_reads_brand_id_fkey
ALTER TABLE ONLY public.perception_reads
    ADD CONSTRAINT perception_reads_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: perception_reads perception_reads_run_id_fkey
ALTER TABLE ONLY public.perception_reads
    ADD CONSTRAINT perception_reads_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;

-- fk constraint: perception_reads perception_reads_workspace_id_fkey
ALTER TABLE ONLY public.perception_reads
    ADD CONSTRAINT perception_reads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: profiles profiles_id_fkey
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: report_files report_files_brand_id_fkey
ALTER TABLE ONLY public.report_files
    ADD CONSTRAINT report_files_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;

-- fk constraint: report_files report_files_created_by_fkey
ALTER TABLE ONLY public.report_files
    ADD CONSTRAINT report_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: report_files report_files_workspace_id_fkey
ALTER TABLE ONLY public.report_files
    ADD CONSTRAINT report_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: report_links report_links_brand_id_fkey
ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: report_links report_links_created_by_fkey
ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: report_links report_links_report_id_fkey
ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;

-- fk constraint: report_links report_links_workspace_id_fkey
ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: report_schedules report_schedules_brand_id_fkey
ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: report_schedules report_schedules_created_by_fkey
ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: report_schedules report_schedules_workspace_id_fkey
ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: report_sends report_sends_schedule_id_fkey
ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.report_schedules(id) ON DELETE CASCADE;

-- fk constraint: report_sends report_sends_workspace_id_fkey
ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: report_styles report_styles_updated_by_fkey
ALTER TABLE ONLY public.report_styles
    ADD CONSTRAINT report_styles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: report_styles report_styles_workspace_id_fkey
ALTER TABLE ONLY public.report_styles
    ADD CONSTRAINT report_styles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: report_versions report_versions_created_by_fkey
ALTER TABLE ONLY public.report_versions
    ADD CONSTRAINT report_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: report_versions report_versions_report_id_fkey
ALTER TABLE ONLY public.report_versions
    ADD CONSTRAINT report_versions_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;

-- fk constraint: report_versions report_versions_workspace_id_fkey
ALTER TABLE ONLY public.report_versions
    ADD CONSTRAINT report_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: reports reports_brand_id_fkey
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: reports reports_created_by_fkey
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: reports reports_updated_by_fkey
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: reports reports_workspace_id_fkey
ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: runs runs_brand_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: runs runs_created_by_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: runs runs_workspace_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: shared_reports shared_reports_brand_id_fkey
ALTER TABLE ONLY public.shared_reports
    ADD CONSTRAINT shared_reports_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: shared_reports shared_reports_created_by_fkey
ALTER TABLE ONLY public.shared_reports
    ADD CONSTRAINT shared_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: shared_reports shared_reports_workspace_id_fkey
ALTER TABLE ONLY public.shared_reports
    ADD CONSTRAINT shared_reports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: site_audits site_audits_created_by_fkey
ALTER TABLE ONLY public.site_audits
    ADD CONSTRAINT site_audits_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: site_audits site_audits_workspace_id_fkey
ALTER TABLE ONLY public.site_audits
    ADD CONSTRAINT site_audits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: sites sites_brand_id_fkey
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: sites sites_workspace_id_fkey
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: task_purchases task_purchases_workspace_id_fkey
ALTER TABLE ONLY public.task_purchases
    ADD CONSTRAINT task_purchases_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: usage_counters usage_counters_workspace_id_fkey
ALTER TABLE ONLY public.usage_counters
    ADD CONSTRAINT usage_counters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: usage usage_workspace_id_fkey
ALTER TABLE ONLY public.usage
    ADD CONSTRAINT usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: webhooks webhooks_workspace_id_fkey
ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspace_invites workspace_invites_invited_by_fkey
ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: workspace_invites workspace_invites_workspace_id_fkey
ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspace_members workspace_members_user_id_fkey
ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: workspace_members workspace_members_workspace_id_fkey
ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspaces workspaces_created_by_fkey
ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: writer_briefs writer_briefs_brand_id_fkey
ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: writer_briefs writer_briefs_item_id_fkey
ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.calendar_items(id) ON DELETE CASCADE;

-- fk constraint: writer_briefs writer_briefs_research_run_id_fkey
ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_research_run_id_fkey FOREIGN KEY (research_run_id) REFERENCES public.article_runs(id) ON DELETE SET NULL;

-- fk constraint: writer_briefs writer_briefs_site_id_fkey
ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: writer_briefs writer_briefs_workspace_id_fkey
ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: writer_cells writer_cells_column_id_fkey
ALTER TABLE ONLY public.writer_cells
    ADD CONSTRAINT writer_cells_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.writer_columns(id) ON DELETE CASCADE;

-- fk constraint: writer_cells writer_cells_item_id_fkey
ALTER TABLE ONLY public.writer_cells
    ADD CONSTRAINT writer_cells_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.calendar_items(id) ON DELETE CASCADE;

-- fk constraint: writer_cells writer_cells_workspace_id_fkey
ALTER TABLE ONLY public.writer_cells
    ADD CONSTRAINT writer_cells_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: writer_columns writer_columns_created_by_fkey
ALTER TABLE ONLY public.writer_columns
    ADD CONSTRAINT writer_columns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: writer_columns writer_columns_site_id_fkey
ALTER TABLE ONLY public.writer_columns
    ADD CONSTRAINT writer_columns_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: writer_columns writer_columns_workspace_id_fkey
ALTER TABLE ONLY public.writer_columns
    ADD CONSTRAINT writer_columns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: writer_drafts writer_drafts_brand_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- fk constraint: writer_drafts writer_drafts_brief_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES public.writer_briefs(id) ON DELETE CASCADE;

-- fk constraint: writer_drafts writer_drafts_doc_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.docs(id) ON DELETE SET NULL;

-- fk constraint: writer_drafts writer_drafts_item_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.calendar_items(id) ON DELETE CASCADE;

-- fk constraint: writer_drafts writer_drafts_site_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;

-- fk constraint: writer_drafts writer_drafts_workspace_id_fkey
ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: writer_images writer_images_draft_id_fkey
ALTER TABLE ONLY public.writer_images
    ADD CONSTRAINT writer_images_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.writer_drafts(id) ON DELETE CASCADE;

-- fk constraint: writer_images writer_images_workspace_id_fkey
ALTER TABLE ONLY public.writer_images
    ADD CONSTRAINT writer_images_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
