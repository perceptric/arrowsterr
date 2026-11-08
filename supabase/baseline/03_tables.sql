-- arrowsterr: tables. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- answers ---------------------------------------------------------------
CREATE TABLE public.answers (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    run_id uuid,
    at timestamp with time zone DEFAULT now() NOT NULL,
    engine text NOT NULL,
    prompt text NOT NULL,
    text text NOT NULL
);

ALTER TABLE public.answers OWNER TO postgres;

ALTER TABLE public.answers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.answers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);

-- api_keys --------------------------------------------------------------
CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    refresh_hash text,
    client_id text,
    created_by uuid
);

ALTER TABLE public.api_keys OWNER TO postgres;

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_hash_key UNIQUE (hash);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_refresh_hash_key UNIQUE (refresh_hash);

-- article_ai_answers ----------------------------------------------------
CREATE TABLE public.article_ai_answers (
    run_id uuid NOT NULL,
    engine text NOT NULL,
    question text NOT NULL,
    answer text,
    cited jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.article_ai_answers OWNER TO postgres;

ALTER TABLE ONLY public.article_ai_answers
    ADD CONSTRAINT article_ai_answers_pkey PRIMARY KEY (run_id, engine);

-- article_pages ---------------------------------------------------------
CREATE TABLE public.article_pages (
    id bigint NOT NULL,
    run_id uuid NOT NULL,
    url text NOT NULL,
    source text NOT NULL,
    "position" integer,
    status text DEFAULT 'queued'::text NOT NULL,
    skip_reason text,
    final_url text,
    title text,
    headings jsonb DEFAULT '[]'::jsonb NOT NULL,
    body text,
    word_count integer,
    tables jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp with time zone,
    error text,
    locked_by text,
    locked_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT article_pages_skip_reason_check CHECK ((skip_reason = ANY (ARRAY['robots'::text, 'private'::text, 'blocked'::text, 'failed'::text, 'timeout'::text, 'empty'::text, 'not_needed'::text]))),
    CONSTRAINT article_pages_source_check CHECK ((source = ANY (ARRAY['serp'::text, 'ai'::text]))),
    CONSTRAINT article_pages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'rendering'::text, 'done'::text, 'skipped'::text])))
);

ALTER TABLE public.article_pages OWNER TO postgres;

ALTER TABLE public.article_pages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.article_pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.article_pages
    ADD CONSTRAINT article_pages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.article_pages
    ADD CONSTRAINT article_pages_run_id_url_key UNIQUE (run_id, url);

-- article_runs ----------------------------------------------------------
CREATE TABLE public.article_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    brand_id uuid,
    item_id uuid NOT NULL,
    keyword text NOT NULL,
    question text,
    status text DEFAULT 'queued'::text NOT NULL,
    step text DEFAULT 'serp'::text NOT NULL,
    error text,
    serp_at timestamp with time zone,
    organic jsonb DEFAULT '[]'::jsonb NOT NULL,
    paa jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_overview jsonb,
    engines text[],
    ai_at timestamp with time zone,
    rounds integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT article_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'searching'::text, 'reading'::text, 'waiting'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT article_runs_step_check CHECK ((step = ANY (ARRAY['serp'::text, 'pages'::text, 'ai'::text, 'reading'::text, 'done'::text])))
);

ALTER TABLE public.article_runs OWNER TO postgres;

ALTER TABLE ONLY public.article_runs
    ADD CONSTRAINT article_runs_pkey PRIMARY KEY (id);

-- article_serp ----------------------------------------------------------
CREATE TABLE public.article_serp (
    run_id uuid NOT NULL,
    "position" integer NOT NULL,
    url text NOT NULL,
    title text,
    snippet text,
    domain text
);

ALTER TABLE public.article_serp OWNER TO postgres;

ALTER TABLE ONLY public.article_serp
    ADD CONSTRAINT article_serp_pkey PRIMARY KEY (run_id, "position");

-- ask_knowledge ---------------------------------------------------------
CREATE TABLE public.ask_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    kind text NOT NULL,
    name text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    content text NOT NULL,
    chars integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ask_knowledge_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'url'::text, 'note'::text])))
);

ALTER TABLE public.ask_knowledge OWNER TO postgres;

ALTER TABLE ONLY public.ask_knowledge
    ADD CONSTRAINT ask_knowledge_pkey PRIMARY KEY (id);

-- ask_messages ----------------------------------------------------------
CREATE TABLE public.ask_messages (
    id bigint NOT NULL,
    thread_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    role text NOT NULL,
    content jsonb NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ask_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

ALTER TABLE public.ask_messages OWNER TO postgres;

ALTER TABLE public.ask_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ask_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.ask_messages
    ADD CONSTRAINT ask_messages_pkey PRIMARY KEY (id);

-- ask_projects ----------------------------------------------------------
CREATE TABLE public.ask_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ask_projects OWNER TO postgres;

ALTER TABLE ONLY public.ask_projects
    ADD CONSTRAINT ask_projects_pkey PRIMARY KEY (id);

-- ask_skills ------------------------------------------------------------
CREATE TABLE public.ask_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    builtin text,
    name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ask_skills OWNER TO postgres;

ALTER TABLE ONLY public.ask_skills
    ADD CONSTRAINT ask_skills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ask_skills
    ADD CONSTRAINT ask_skills_workspace_id_builtin_key UNIQUE (workspace_id, builtin);

-- ask_threads -----------------------------------------------------------
CREATE TABLE public.ask_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text DEFAULT 'New chat'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid
);

ALTER TABLE public.ask_threads OWNER TO postgres;

ALTER TABLE ONLY public.ask_threads
    ADD CONSTRAINT ask_threads_pkey PRIMARY KEY (id);

-- brand_guidelines ------------------------------------------------------
CREATE TABLE public.brand_guidelines (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    links text[] DEFAULT '{}'::text[] NOT NULL,
    files jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brand_guidelines_body_check CHECK ((char_length(body) <= 50000)),
    CONSTRAINT brand_guidelines_files_check CHECK (((jsonb_typeof(files) = 'array'::text) AND (jsonb_array_length(files) <= 10))),
    CONSTRAINT brand_guidelines_links_check CHECK ((cardinality(links) <= 20))
);

ALTER TABLE public.brand_guidelines OWNER TO postgres;

ALTER TABLE ONLY public.brand_guidelines
    ADD CONSTRAINT brand_guidelines_pkey PRIMARY KEY (brand_id);

-- brand_kits ------------------------------------------------------------
CREATE TABLE public.brand_kits (
    workspace_id uuid NOT NULL,
    key text NOT NULL,
    brand_id uuid,
    website text,
    kit jsonb NOT NULL,
    learned_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brand_kits_check CHECK ((((key = 'workspace'::text) AND (brand_id IS NULL)) OR ((brand_id IS NOT NULL) AND (key = (brand_id)::text))))
);

ALTER TABLE public.brand_kits OWNER TO postgres;

ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_pkey PRIMARY KEY (workspace_id, key);

-- brand_settings --------------------------------------------------------
CREATE TABLE public.brand_settings (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    slack_channel text,
    alert_points integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brand_settings_alert_points_check CHECK (((alert_points >= 1) AND (alert_points <= 50)))
);

ALTER TABLE public.brand_settings OWNER TO postgres;

ALTER TABLE ONLY public.brand_settings
    ADD CONSTRAINT brand_settings_pkey PRIMARY KEY (brand_id);

-- brand_voices ----------------------------------------------------------
CREATE TABLE public.brand_voices (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    sample_urls text[] DEFAULT '{}'::text[] NOT NULL,
    sample_text text DEFAULT ''::text NOT NULL,
    voice jsonb,
    distilled_at timestamp with time zone,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brand_voices_sample_text_check CHECK ((char_length(sample_text) <= 30000)),
    CONSTRAINT brand_voices_sample_urls_check CHECK ((cardinality(sample_urls) <= 5))
);

ALTER TABLE public.brand_voices OWNER TO postgres;

ALTER TABLE ONLY public.brand_voices
    ADD CONSTRAINT brand_voices_pkey PRIMARY KEY (brand_id);

-- brands ----------------------------------------------------------------
CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    url text NOT NULL,
    domain text NOT NULL,
    name text NOT NULL,
    logo text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    prompts text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    daily boolean DEFAULT true NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    umami_website_id text,
    site_platform text,
    install_token text,
    ga4_property text,
    ga4_property_name text,
    ga4_email text,
    listen jsonb DEFAULT '{}'::jsonb NOT NULL,
    listened_on date,
    brands_checked integer DEFAULT 0 NOT NULL,
    perception jsonb
);

ALTER TABLE public.brands OWNER TO postgres;

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_install_token_key UNIQUE (install_token);

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);

-- bulk_runs -------------------------------------------------------------
CREATE TABLE public.bulk_runs (
    id text NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid,
    kind text NOT NULL,
    country text NOT NULL,
    count integer NOT NULL,
    items jsonb NOT NULL,
    result jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bulk_runs_kind_check CHECK ((kind = ANY (ARRAY['keywords'::text, 'domains'::text])))
);

ALTER TABLE public.bulk_runs OWNER TO postgres;

ALTER TABLE ONLY public.bulk_runs
    ADD CONSTRAINT bulk_runs_pkey PRIMARY KEY (id);

-- calendar_items --------------------------------------------------------
CREATE TABLE public.calendar_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    keyword text NOT NULL,
    secondary text[] DEFAULT '{}'::text[] NOT NULL,
    stage text,
    theme text,
    volume integer,
    difficulty integer,
    intent text,
    cpc numeric,
    status text DEFAULT 'planned'::text NOT NULL,
    due_date date,
    owner text,
    url text,
    notes text,
    source text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    action text DEFAULT 'new'::text NOT NULL,
    current_url text,
    current_rank integer,
    brief jsonb,
    brief_status text,
    brief_error text,
    brief_at timestamp with time zone,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    serp jsonb,
    serp_at timestamp with time zone,
    brief_started_at timestamp with time zone,
    library_at timestamp with time zone,
    CONSTRAINT calendar_items_action_check CHECK ((action = ANY (ARRAY['new'::text, 'update'::text]))),
    CONSTRAINT calendar_items_brief_status_check CHECK ((brief_status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT calendar_items_stage_check CHECK ((stage = ANY (ARRAY['bofu'::text, 'mofu'::text, 'tofu'::text]))),
    CONSTRAINT calendar_items_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'brief'::text, 'writing'::text, 'review'::text, 'published'::text])))
);

ALTER TABLE public.calendar_items OWNER TO postgres;

ALTER TABLE ONLY public.calendar_items
    ADD CONSTRAINT calendar_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_items
    ADD CONSTRAINT calendar_items_site_id_keyword_key UNIQUE (site_id, keyword);

-- change_sets -----------------------------------------------------------
CREATE TABLE public.change_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    connection_id uuid,
    thread_id uuid,
    play text NOT NULL,
    title text NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'preparing'::text NOT NULL,
    step text DEFAULT ''::text NOT NULL,
    error text,
    created_by uuid,
    applied_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_at timestamp with time zone,
    CONSTRAINT change_sets_status_check CHECK ((status = ANY (ARRAY['preparing'::text, 'ready'::text, 'applying'::text, 'applied'::text, 'partly'::text, 'failed'::text, 'undone'::text])))
);

ALTER TABLE public.change_sets OWNER TO postgres;

ALTER TABLE ONLY public.change_sets
    ADD CONSTRAINT change_sets_pkey PRIMARY KEY (id);

-- changes ---------------------------------------------------------------
CREATE TABLE public.changes (
    id bigint NOT NULL,
    change_set_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    url text,
    label text DEFAULT ''::text NOT NULL,
    field text NOT NULL,
    before jsonb,
    after jsonb NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    error text,
    applied_at timestamp with time zone,
    CONSTRAINT changes_field_check CHECK ((field = ANY (ARRAY['alt'::text, 'meta'::text, 'schema'::text, 'faq'::text, 'links'::text, 'content'::text]))),
    CONSTRAINT changes_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text, 'applied'::text, 'failed'::text, 'undone'::text]))),
    CONSTRAINT changes_target_type_check CHECK ((target_type = ANY (ARRAY['post'::text, 'page'::text, 'media'::text])))
);

ALTER TABLE public.changes OWNER TO postgres;

ALTER TABLE public.changes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.changes
    ADD CONSTRAINT changes_pkey PRIMARY KEY (id);

-- cms_connections -------------------------------------------------------
CREATE TABLE public.cms_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_id uuid,
    backfilled boolean DEFAULT false NOT NULL,
    CONSTRAINT cms_connections_kind_check CHECK ((kind = ANY (ARRAY['wordpress'::text, 'webflow'::text, 'shopify'::text, 'hubspot'::text, 'ghost'::text])))
);

ALTER TABLE public.cms_connections OWNER TO postgres;

ALTER TABLE ONLY public.cms_connections
    ADD CONSTRAINT cms_connections_pkey PRIMARY KEY (id);

-- cost_ledger -----------------------------------------------------------
CREATE TABLE public.cost_ledger (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    cost numeric(12,6) NOT NULL,
    parts jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.cost_ledger OWNER TO postgres;

ALTER TABLE public.cost_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cost_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.cost_ledger
    ADD CONSTRAINT cost_ledger_pkey PRIMARY KEY (id);

-- daily_metrics ---------------------------------------------------------
CREATE TABLE public.daily_metrics (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    engine text NOT NULL,
    named text NOT NULL,
    is_you boolean DEFAULT false NOT NULL,
    answers integer DEFAULT 0 NOT NULL,
    mentions integer DEFAULT 0 NOT NULL,
    position_sum numeric DEFAULT 0 NOT NULL,
    sentiment_sum numeric DEFAULT 0 NOT NULL
);

ALTER TABLE public.daily_metrics OWNER TO postgres;

ALTER TABLE ONLY public.daily_metrics
    ADD CONSTRAINT daily_metrics_pkey PRIMARY KEY (brand_id, day, engine, named);

-- doc_publications ------------------------------------------------------
CREATE TABLE public.doc_publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    doc_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    kind text DEFAULT 'wordpress'::text NOT NULL,
    remote_id text,
    url text,
    remote_status text,
    remote_modified timestamp with time zone,
    pushed_modified timestamp with time zone,
    mode text,
    scheduled_for timestamp with time zone,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    media jsonb DEFAULT '{}'::jsonb NOT NULL,
    creating_since timestamp with time zone,
    locked_until timestamp with time zone,
    last_error text,
    pushed_at timestamp with time zone,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT doc_publications_kind_check CHECK ((kind = 'wordpress'::text)),
    CONSTRAINT doc_publications_mode_check CHECK ((mode = ANY (ARRAY['draft'::text, 'publish'::text, 'schedule'::text]))),
    CONSTRAINT doc_publications_remote_status_check CHECK ((remote_status = ANY (ARRAY['draft'::text, 'pending'::text, 'private'::text, 'future'::text, 'publish'::text, 'trash'::text, 'deleted'::text])))
);

ALTER TABLE public.doc_publications OWNER TO postgres;

ALTER TABLE ONLY public.doc_publications
    ADD CONSTRAINT doc_publications_doc_id_connection_id_key UNIQUE (doc_id, connection_id);

ALTER TABLE ONLY public.doc_publications
    ADD CONSTRAINT doc_publications_pkey PRIMARY KEY (id);

-- doc_versions ----------------------------------------------------------
CREATE TABLE public.doc_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    doc_id uuid NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    words integer DEFAULT 0 NOT NULL,
    reason text DEFAULT 'regenerate'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.doc_versions OWNER TO postgres;

ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_pkey PRIMARY KEY (id);

-- docs ------------------------------------------------------------------
CREATE TABLE public.docs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    calendar_item_id uuid,
    title text DEFAULT 'Untitled'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    words integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.docs OWNER TO postgres;

ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_calendar_item_id_key UNIQUE (calendar_item_id);

ALTER TABLE ONLY public.docs
    ADD CONSTRAINT docs_pkey PRIMARY KEY (id);

-- email_log -------------------------------------------------------------
CREATE TABLE public.email_log (
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    period text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.email_log OWNER TO postgres;

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (workspace_id, kind, period);

-- free_runs -------------------------------------------------------------
CREATE TABLE public.free_runs (
    id bigint NOT NULL,
    tool text NOT NULL,
    key text NOT NULL,
    ip_hash text NOT NULL,
    result jsonb,
    cost numeric(12,6) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.free_runs OWNER TO postgres;

ALTER TABLE public.free_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.free_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.free_runs
    ADD CONSTRAINT free_runs_pkey PRIMARY KEY (id);

-- ga4_connections -------------------------------------------------------
CREATE TABLE public.ga4_connections (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    refresh_token text NOT NULL,
    email text,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ga4_connections OWNER TO postgres;

ALTER TABLE ONLY public.ga4_connections
    ADD CONSTRAINT ga4_connections_pkey PRIMARY KEY (brand_id);

-- gsc_connections -------------------------------------------------------
CREATE TABLE public.gsc_connections (
    site_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    refresh_token text NOT NULL,
    email text,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.gsc_connections OWNER TO postgres;

ALTER TABLE ONLY public.gsc_connections
    ADD CONSTRAINT gsc_connections_pkey PRIMARY KEY (site_id);

-- industry_research -----------------------------------------------------
CREATE TABLE public.industry_research (
    brand_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error text,
    audience text DEFAULT ''::text NOT NULL,
    report_id text,
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT industry_research_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.industry_research OWNER TO postgres;

ALTER TABLE ONLY public.industry_research
    ADD CONSTRAINT industry_research_pkey PRIMARY KEY (brand_id);

-- integrations ----------------------------------------------------------
CREATE TABLE public.integrations (
    workspace_id uuid NOT NULL,
    slack_webhook text,
    alert_points integer DEFAULT 5 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.integrations OWNER TO postgres;

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (workspace_id);

-- jobs ------------------------------------------------------------------
CREATE TABLE public.jobs (
    id bigint NOT NULL,
    kind text NOT NULL,
    key text,
    workspace_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 6 NOT NULL,
    locked_until timestamp with time zone,
    locked_by text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'dead'::text])))
);

ALTER TABLE public.jobs OWNER TO postgres;

ALTER TABLE public.jobs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_key_key UNIQUE (key);

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

-- keyword_cache ---------------------------------------------------------
CREATE TABLE public.keyword_cache (
    key text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.keyword_cache OWNER TO postgres;

ALTER TABLE ONLY public.keyword_cache
    ADD CONSTRAINT keyword_cache_pkey PRIMARY KEY (key);

-- keyword_runs ----------------------------------------------------------
CREATE TABLE public.keyword_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    step text DEFAULT ''::text NOT NULL,
    error text,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT keyword_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.keyword_runs OWNER TO postgres;

ALTER TABLE ONLY public.keyword_runs
    ADD CONSTRAINT keyword_runs_pkey PRIMARY KEY (id);

-- mentions --------------------------------------------------------------
CREATE TABLE public.mentions (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    is_you boolean DEFAULT false NOT NULL,
    source text NOT NULL,
    url text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    author text,
    posted_at timestamp with time zone,
    found_at timestamp with time zone DEFAULT now() NOT NULL,
    sentiment smallint,
    kind text,
    CONSTRAINT mentions_kind_check CHECK ((kind = ANY (ARRAY['question'::text, 'complaint'::text, 'praise'::text, 'comparison'::text, 'news'::text, 'other'::text]))),
    CONSTRAINT mentions_sentiment_check CHECK (((sentiment >= 0) AND (sentiment <= 100)))
);

ALTER TABLE public.mentions OWNER TO postgres;

ALTER TABLE public.mentions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mentions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_brand_id_name_url_key UNIQUE (brand_id, name, url);

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_pkey PRIMARY KEY (id);

-- notification_prefs ----------------------------------------------------
CREATE TABLE public.notification_prefs (
    workspace_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    weekly boolean DEFAULT true NOT NULL,
    alerts boolean DEFAULT true NOT NULL,
    jobs boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.notification_prefs OWNER TO postgres;

ALTER TABLE ONLY public.notification_prefs
    ADD CONSTRAINT notification_prefs_pkey PRIMARY KEY (workspace_id, user_id);

-- oauth_clients ---------------------------------------------------------
CREATE TABLE public.oauth_clients (
    id text NOT NULL,
    name text NOT NULL,
    redirect_uris text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.oauth_clients OWNER TO postgres;

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);

-- oauth_codes -----------------------------------------------------------
CREATE TABLE public.oauth_codes (
    hash text NOT NULL,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);

ALTER TABLE public.oauth_codes OWNER TO postgres;

ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_pkey PRIMARY KEY (hash);

-- outreach_lists --------------------------------------------------------
CREATE TABLE public.outreach_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_lists_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
);

ALTER TABLE public.outreach_lists OWNER TO postgres;

ALTER TABLE ONLY public.outreach_lists
    ADD CONSTRAINT outreach_lists_pkey PRIMARY KEY (id);

-- outreach_suppression --------------------------------------------------
CREATE TABLE public.outreach_suppression (
    workspace_id uuid NOT NULL,
    value text NOT NULL,
    reason text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.outreach_suppression OWNER TO postgres;

ALTER TABLE ONLY public.outreach_suppression
    ADD CONSTRAINT outreach_suppression_pkey PRIMARY KEY (workspace_id, value);

-- outreach_targets ------------------------------------------------------
CREATE TABLE public.outreach_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    list_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    url text,
    domain text,
    email text,
    email_source text,
    email_status text DEFAULT 'pending'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    added_from text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    draft_status text DEFAULT 'none'::text NOT NULL,
    draft_purpose text,
    draft_note text,
    draft_subject text,
    draft_body text,
    draft_why text,
    draft_error text,
    drafted_at timestamp with time zone,
    CONSTRAINT outreach_targets_draft_status_check CHECK ((draft_status = ANY (ARRAY['none'::text, 'pending'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT outreach_targets_email_source_check CHECK ((email_source = ANY (ARRAY['contact_page'::text, 'site'::text, 'rss'::text, 'manual'::text]))),
    CONSTRAINT outreach_targets_email_status_check CHECK ((email_status = ANY (ARRAY['pending'::text, 'found'::text, 'not_found'::text, 'manual'::text]))),
    CONSTRAINT outreach_targets_kind_check CHECK ((kind = ANY (ARRAY['website'::text, 'press'::text, 'podcast'::text, 'youtube'::text, 'social'::text]))),
    CONSTRAINT outreach_targets_status_check CHECK ((status = ANY (ARRAY['new'::text, 'drafted'::text, 'scheduled'::text, 'sent'::text, 'replied'::text, 'do_not_contact'::text])))
);

ALTER TABLE public.outreach_targets OWNER TO postgres;

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_list_id_kind_name_key UNIQUE (list_id, kind, name);

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_pkey PRIMARY KEY (id);

-- perception_reads ------------------------------------------------------
CREATE TABLE public.perception_reads (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    run_id uuid,
    source text NOT NULL,
    kind text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    engine text NOT NULL,
    prompt text NOT NULL,
    named text NOT NULL,
    words jsonb DEFAULT '[]'::jsonb NOT NULL,
    unknown boolean DEFAULT false NOT NULL,
    answer text,
    category text,
    CONSTRAINT perception_reads_kind_check CHECK ((kind = ANY (ARRAY['describe'::text, 'objections'::text]))),
    CONSTRAINT perception_reads_source_check CHECK ((source = ANY (ARRAY['buyer'::text, 'direct'::text])))
);

ALTER TABLE public.perception_reads OWNER TO postgres;

ALTER TABLE public.perception_reads ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.perception_reads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.perception_reads
    ADD CONSTRAINT perception_reads_pkey PRIMARY KEY (id);

-- profiles --------------------------------------------------------------
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_avatar_check CHECK ((char_length(avatar) <= 200000)),
    CONSTRAINT profiles_full_name_check CHECK ((char_length(full_name) <= 120))
);

ALTER TABLE public.profiles OWNER TO postgres;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

-- rate_buckets ----------------------------------------------------------
CREATE TABLE public.rate_buckets (
    key text NOT NULL,
    minute timestamp with time zone NOT NULL,
    used integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.rate_buckets OWNER TO postgres;

ALTER TABLE ONLY public.rate_buckets
    ADD CONSTRAINT rate_buckets_pkey PRIMARY KEY (key, minute);

-- report_files ----------------------------------------------------------
CREATE TABLE public.report_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    page text NOT NULL,
    title text NOT NULL,
    design text DEFAULT 'arrowsterr'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    snapshot jsonb NOT NULL,
    status text DEFAULT 'making'::text NOT NULL,
    pdf_path text,
    error text,
    source text DEFAULT 'download'::text NOT NULL,
    schedule_id uuid,
    job_id bigint,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_files_design_check CHECK ((design = ANY (ARRAY['arrowsterr'::text, 'brand'::text]))),
    CONSTRAINT report_files_source_check CHECK ((source = ANY (ARRAY['download'::text, 'schedule'::text]))),
    CONSTRAINT report_files_status_check CHECK ((status = ANY (ARRAY['making'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT report_files_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))
);

ALTER TABLE public.report_files OWNER TO postgres;

ALTER TABLE ONLY public.report_files
    ADD CONSTRAINT report_files_pkey PRIMARY KEY (id);

-- report_links ----------------------------------------------------------
CREATE TABLE public.report_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    workspace_id uuid NOT NULL,
    report_id uuid,
    brand_id uuid,
    mode text DEFAULT 'frozen'::text NOT NULL,
    snapshot jsonb,
    password_hash text,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    views integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp with time zone,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locked boolean GENERATED ALWAYS AS ((password_hash IS NOT NULL)) STORED,
    CONSTRAINT report_links_check CHECK ((((mode = 'live'::text) AND (report_id IS NOT NULL)) OR ((mode = 'frozen'::text) AND (snapshot IS NOT NULL)))),
    CONSTRAINT report_links_mode_check CHECK ((mode = ANY (ARRAY['live'::text, 'frozen'::text])))
);

ALTER TABLE public.report_links OWNER TO postgres;

ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.report_links
    ADD CONSTRAINT report_links_token_key UNIQUE (token);

-- report_schedules ------------------------------------------------------
CREATE TABLE public.report_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    pages text[] NOT NULL,
    design text DEFAULT 'arrowsterr'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    cadence text NOT NULL,
    weekday smallint,
    monthday smallint,
    hour smallint DEFAULT 9 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    recipients text[] NOT NULL,
    subject text,
    active boolean DEFAULT true NOT NULL,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_schedules_cadence_check CHECK ((cadence = ANY (ARRAY['weekly'::text, 'monthly'::text]))),
    CONSTRAINT report_schedules_design_check CHECK ((design = ANY (ARRAY['arrowsterr'::text, 'brand'::text]))),
    CONSTRAINT report_schedules_hour_check CHECK (((hour >= 0) AND (hour <= 23))),
    CONSTRAINT report_schedules_monthday_check CHECK (((monthday >= 1) AND (monthday <= 28))),
    CONSTRAINT report_schedules_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT report_schedules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

ALTER TABLE public.report_schedules OWNER TO postgres;

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);

-- report_sends ----------------------------------------------------------
CREATE TABLE public.report_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status text DEFAULT 'working'::text NOT NULL,
    file_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    error text,
    attempts smallint DEFAULT 0 NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT report_sends_status_check CHECK ((status = ANY (ARRAY['working'::text, 'sent'::text, 'failed'::text])))
);

ALTER TABLE public.report_sends OWNER TO postgres;

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_schedule_id_due_at_key UNIQUE (schedule_id, due_at);

-- report_styles ---------------------------------------------------------
CREATE TABLE public.report_styles (
    workspace_id uuid NOT NULL,
    style jsonb NOT NULL,
    website text,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.report_styles OWNER TO postgres;

ALTER TABLE ONLY public.report_styles
    ADD CONSTRAINT report_styles_pkey PRIMARY KEY (workspace_id);

-- report_versions -------------------------------------------------------
CREATE TABLE public.report_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text,
    doc jsonb NOT NULL,
    range jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_versions_name_check CHECK (((name IS NULL) OR (char_length(name) <= 80)))
);

ALTER TABLE public.report_versions OWNER TO postgres;

ALTER TABLE ONLY public.report_versions
    ADD CONSTRAINT report_versions_pkey PRIMARY KEY (id);

-- reports ---------------------------------------------------------------
CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    kind text DEFAULT 'client'::text NOT NULL,
    name text DEFAULT 'Client report'::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    range jsonb DEFAULT '{"preset": "last30", "compare": "previous"}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT reports_kind_check CHECK ((kind = ANY (ARRAY['client'::text, 'prompts'::text, 'competitors'::text, 'intel'::text]))),
    CONSTRAINT reports_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))
);

ALTER TABLE public.reports OWNER TO postgres;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

-- runs ------------------------------------------------------------------
CREATE TABLE public.runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    engines text[] DEFAULT '{}'::text[] NOT NULL,
    chats jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    prompts text[],
    status text DEFAULT 'done'::text NOT NULL,
    queued jsonb DEFAULT '[]'::jsonb NOT NULL,
    expected integer,
    perception_read integer DEFAULT 0 NOT NULL,
    CONSTRAINT runs_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'daily'::text]))),
    CONSTRAINT runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'limited'::text])))
);

ALTER TABLE public.runs OWNER TO postgres;

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);

-- shared_answers --------------------------------------------------------
CREATE TABLE public.shared_answers (
    engine text NOT NULL,
    prompt_key text NOT NULL,
    market text DEFAULT 'default'::text NOT NULL,
    day date NOT NULL,
    answer jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.shared_answers OWNER TO postgres;

ALTER TABLE ONLY public.shared_answers
    ADD CONSTRAINT shared_answers_pkey PRIMARY KEY (engine, prompt_key, market, day);

-- shared_reports --------------------------------------------------------
CREATE TABLE public.shared_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    data jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.shared_reports OWNER TO postgres;

ALTER TABLE ONLY public.shared_reports
    ADD CONSTRAINT shared_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shared_reports
    ADD CONSTRAINT shared_reports_token_key UNIQUE (token);

-- site_audits -----------------------------------------------------------
CREATE TABLE public.site_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    domain text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    step text DEFAULT 'Starting'::text NOT NULL,
    pages integer DEFAULT 0 NOT NULL,
    score integer,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT site_audits_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.site_audits OWNER TO postgres;

ALTER TABLE ONLY public.site_audits
    ADD CONSTRAINT site_audits_pkey PRIMARY KEY (id);

-- sites -----------------------------------------------------------------
CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    domain text NOT NULL,
    name text NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pages jsonb DEFAULT '[]'::jsonb NOT NULL,
    pages_at timestamp with time zone,
    gsc_property text,
    gsc_email text,
    guideline jsonb,
    guideline_at timestamp with time zone
);

ALTER TABLE public.sites OWNER TO postgres;

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_brand_id_key UNIQUE (brand_id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_workspace_id_domain_key UNIQUE (workspace_id, domain);

-- snapshots -------------------------------------------------------------
CREATE TABLE public.snapshots (
    id bigint NOT NULL,
    domain text NOT NULL,
    ip_hash text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.snapshots OWNER TO postgres;

ALTER TABLE public.snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);

-- stripe_events ---------------------------------------------------------
CREATE TABLE public.stripe_events (
    id text NOT NULL,
    type text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.stripe_events OWNER TO postgres;

ALTER TABLE ONLY public.stripe_events
    ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);

-- task_purchases --------------------------------------------------------
CREATE TABLE public.task_purchases (
    id text NOT NULL,
    workspace_id uuid NOT NULL,
    tasks integer NOT NULL,
    amount integer NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.task_purchases OWNER TO postgres;

ALTER TABLE ONLY public.task_purchases
    ADD CONSTRAINT task_purchases_pkey PRIMARY KEY (id);

-- usage -----------------------------------------------------------------
CREATE TABLE public.usage (
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    answers integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.usage OWNER TO postgres;

ALTER TABLE ONLY public.usage
    ADD CONSTRAINT usage_pkey PRIMARY KEY (workspace_id, day);

-- usage_counters --------------------------------------------------------
CREATE TABLE public.usage_counters (
    workspace_id uuid NOT NULL,
    metric text NOT NULL,
    period text NOT NULL,
    used integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.usage_counters OWNER TO postgres;

ALTER TABLE ONLY public.usage_counters
    ADD CONSTRAINT usage_counters_pkey PRIMARY KEY (workspace_id, metric, period);

-- webhooks --------------------------------------------------------------
CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    url text NOT NULL,
    event text NOT NULL,
    source text DEFAULT 'api'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.webhooks OWNER TO postgres;

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);

-- workspace_invites -----------------------------------------------------
CREATE TABLE public.workspace_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    role public.ws_role NOT NULL,
    token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT workspace_invites_role_check CHECK ((role <> 'owner'::public.ws_role))
);

ALTER TABLE public.workspace_invites OWNER TO postgres;

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_token_key UNIQUE (token);

-- workspace_members -----------------------------------------------------
CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text,
    role public.ws_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workspace_members OWNER TO postgres;

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);

-- workspaces ------------------------------------------------------------
CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_limit integer DEFAULT 3 NOT NULL,
    prompt_limit integer DEFAULT 25 NOT NULL,
    daily_answer_limit integer DEFAULT 180 NOT NULL,
    plan text DEFAULT 'trial'::text NOT NULL,
    plan_status text DEFAULT 'trialing'::text NOT NULL,
    trial_ends_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    period_end timestamp with time zone,
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    task_credits integer DEFAULT 0 NOT NULL,
    avatar text,
    timezone text,
    ai_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    allowed_domain text,
    join_role public.ws_role DEFAULT 'viewer'::public.ws_role NOT NULL,
    seat_limit integer DEFAULT 3 NOT NULL,
    billing_anchor timestamp with time zone DEFAULT now(),
    billing_interval text,
    cancel_at timestamp with time zone,
    CONSTRAINT workspaces_allowed_domain CHECK (((allowed_domain IS NULL) OR (allowed_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'::text))),
    CONSTRAINT workspaces_join_role CHECK ((join_role = ANY (ARRAY['viewer'::public.ws_role, 'editor'::public.ws_role]))),
    CONSTRAINT workspaces_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT workspaces_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'trial'::text, 'foundation'::text, 'scale'::text, 'thrive'::text, 'agency'::text, 'enterprise'::text, 'legacy'::text]))),
    CONSTRAINT workspaces_plan_status_check CHECK ((plan_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'read_only'::text])))
);

ALTER TABLE public.workspaces OWNER TO postgres;

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

-- writer_briefs ---------------------------------------------------------
CREATE TABLE public.writer_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    site_id uuid NOT NULL,
    item_id uuid NOT NULL,
    research_run_id uuid,
    keyword text NOT NULL,
    status text DEFAULT 'generating'::text NOT NULL,
    step text DEFAULT 'research'::text NOT NULL,
    brief jsonb,
    notes text DEFAULT ''::text NOT NULL,
    note text,
    version integer DEFAULT 1 NOT NULL,
    error text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_draft boolean DEFAULT false NOT NULL,
    CONSTRAINT writer_briefs_note_check CHECK ((char_length(note) <= 300)),
    CONSTRAINT writer_briefs_notes_check CHECK ((char_length(notes) <= 4000)),
    CONSTRAINT writer_briefs_status_check CHECK ((status = ANY (ARRAY['generating'::text, 'ready'::text, 'approved'::text, 'failed'::text]))),
    CONSTRAINT writer_briefs_step_check CHECK ((step = ANY (ARRAY['research'::text, 'writing'::text, 'done'::text])))
);

ALTER TABLE public.writer_briefs OWNER TO postgres;

ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_item_id_key UNIQUE (item_id);

ALTER TABLE ONLY public.writer_briefs
    ADD CONSTRAINT writer_briefs_pkey PRIMARY KEY (id);

-- writer_cells ----------------------------------------------------------
CREATE TABLE public.writer_cells (
    column_id uuid NOT NULL,
    item_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writer_cells_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'generating'::text, 'failed'::text]))),
    CONSTRAINT writer_cells_value_check CHECK ((char_length(value) <= 20000))
);

ALTER TABLE public.writer_cells OWNER TO postgres;

ALTER TABLE ONLY public.writer_cells
    ADD CONSTRAINT writer_cells_pkey PRIMARY KEY (column_id, item_id);

-- writer_columns --------------------------------------------------------
CREATE TABLE public.writer_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    site_id uuid NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    prompt text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writer_columns_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'ai'::text]))),
    CONSTRAINT writer_columns_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT writer_columns_prompt_check CHECK ((char_length(prompt) <= 4000))
);

ALTER TABLE public.writer_columns OWNER TO postgres;

ALTER TABLE ONLY public.writer_columns
    ADD CONSTRAINT writer_columns_pkey PRIMARY KEY (id);

-- writer_drafts ---------------------------------------------------------
CREATE TABLE public.writer_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    site_id uuid NOT NULL,
    item_id uuid NOT NULL,
    brief_id uuid NOT NULL,
    doc_id uuid,
    status text DEFAULT 'generating'::text NOT NULL,
    step text DEFAULT 'sections'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    note text,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    checked jsonb,
    check_at timestamp with time zone,
    modules jsonb DEFAULT '[]'::jsonb NOT NULL,
    period text NOT NULL,
    words integer DEFAULT 0 NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ready_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    styled jsonb,
    images jsonb,
    CONSTRAINT writer_drafts_note_check CHECK ((char_length(note) <= 300)),
    CONSTRAINT writer_drafts_status_check CHECK ((status = ANY (ARRAY['generating'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT writer_drafts_step_check CHECK ((step = ANY (ARRAY['sections'::text, 'style'::text, 'check'::text, 'images'::text, 'modules'::text, 'save'::text, 'done'::text])))
);

ALTER TABLE public.writer_drafts OWNER TO postgres;

ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_item_id_key UNIQUE (item_id);

ALTER TABLE ONLY public.writer_drafts
    ADD CONSTRAINT writer_drafts_pkey PRIMARY KEY (id);

-- writer_images ---------------------------------------------------------
CREATE TABLE public.writer_images (
    id bigint NOT NULL,
    workspace_id uuid NOT NULL,
    draft_id uuid NOT NULL,
    version integer NOT NULL,
    n integer NOT NULL,
    kind text NOT NULL,
    url text,
    html text,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    locked_by text,
    locked_until timestamp with time zone,
    path text,
    public_url text,
    width integer,
    height integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writer_images_html_check CHECK ((char_length(html) <= 2000000)),
    CONSTRAINT writer_images_kind_check CHECK ((kind = ANY (ARRAY['featured'::text, 'screenshot'::text, 'chart'::text, 'steps'::text, 'comparison'::text, 'checklist'::text, 'anatomy'::text]))),
    CONSTRAINT writer_images_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'working'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.writer_images OWNER TO postgres;

ALTER TABLE public.writer_images ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.writer_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.writer_images
    ADD CONSTRAINT writer_images_draft_id_version_n_key UNIQUE (draft_id, version, n);

ALTER TABLE ONLY public.writer_images
    ADD CONSTRAINT writer_images_pkey PRIMARY KEY (id);
