-- Optional seed data (dev). Run after migrations: `supabase db reset` or SQL editor.

-- Local-dev grant reconciliation.
-- Some Supabase Postgres images ship default privileges for the `postgres` role
-- in schema `public` that omit DML (SELECT/INSERT/UPDATE/DELETE) for the
-- anon/authenticated/service_role roles. Because migrations run as `postgres`,
-- every table then lacks those grants locally, so RLS-protected reads/writes fail
-- with "permission denied for table ...". Hosted Supabase projects grant these by
-- default, so this block only reconciles the local stack to match production.
-- Idempotent and safe to re-run.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
