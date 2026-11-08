-- arrowsterr: triggers. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- trigger: brand_guidelines brand_guidelines_brand_matches
CREATE TRIGGER brand_guidelines_brand_matches BEFORE INSERT OR UPDATE ON public.brand_guidelines FOR EACH ROW EXECUTE FUNCTION public.run_brand_matches();

-- trigger: brand_settings brand_settings_brand_matches
CREATE TRIGGER brand_settings_brand_matches BEFORE INSERT OR UPDATE ON public.brand_settings FOR EACH ROW EXECUTE FUNCTION public.run_brand_matches();

-- trigger: brand_voices brand_voices_brand_matches
CREATE TRIGGER brand_voices_brand_matches BEFORE INSERT OR UPDATE ON public.brand_voices FOR EACH ROW EXECUTE FUNCTION public.run_brand_matches();

-- trigger: brands brands_limits
CREATE TRIGGER brands_limits BEFORE INSERT OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.check_brand_limits();

-- trigger: cms_connections cms_connections_brand_matches
CREATE TRIGGER cms_connections_brand_matches BEFORE INSERT OR UPDATE ON public.cms_connections FOR EACH ROW EXECUTE FUNCTION public.cms_brand_matches();

-- trigger: doc_publications doc_publications_matches
CREATE TRIGGER doc_publications_matches BEFORE INSERT OR UPDATE OF workspace_id, doc_id, connection_id ON public.doc_publications FOR EACH ROW EXECUTE FUNCTION public.doc_publication_matches();

-- trigger: workspace_invites invites_seats
CREATE TRIGGER invites_seats BEFORE INSERT ON public.workspace_invites FOR EACH ROW EXECUTE FUNCTION public.check_seats();

-- trigger: workspace_members members_seats
CREATE TRIGGER members_seats BEFORE INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.check_seats();

-- trigger: runs runs_brand_matches
CREATE TRIGGER runs_brand_matches BEFORE INSERT OR UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.run_brand_matches();

-- trigger: workspaces workspace_starter_kit
CREATE TRIGGER workspace_starter_kit AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.workspace_starter_kit();

-- trigger: workspaces workspaces_one_trial
CREATE TRIGGER workspaces_one_trial BEFORE INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.trial_from_signup();

-- event trigger: issue_graphql_placeholder
CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();

ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

-- event trigger: issue_pg_cron_access
CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();

ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

-- event trigger: issue_pg_graphql_access
CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();

ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

-- event trigger: issue_pg_net_access
CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();

ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

-- event trigger: pgrst_ddl_watch
CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();

ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

-- event trigger: pgrst_drop_watch
CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();

ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

\unrestrict mfJSpFTU5Dt3SiDHCFqxV2LkGsbEETtMY2QeSFEaD8kJrhnRgQcqv4A1Ohrxvfd
