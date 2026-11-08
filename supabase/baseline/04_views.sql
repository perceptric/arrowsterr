-- arrowsterr: views. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- view: cost_by_workspace
CREATE VIEW public.cost_by_workspace WITH (security_invoker='true') AS
 SELECT w.id AS workspace_id,
    w.name,
    w.plan,
    (date_trunc('month'::text, c.at))::date AS month,
    round(sum(c.cost), 2) AS cost,
    count(*) AS actions
   FROM (public.cost_ledger c
     JOIN public.workspaces w ON ((w.id = c.workspace_id)))
  GROUP BY w.id, w.name, w.plan, (date_trunc('month'::text, c.at));

ALTER VIEW public.cost_by_workspace OWNER TO postgres;
