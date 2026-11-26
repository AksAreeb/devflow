-- devflow step 19: catalogue checks for PostgreSQL.
--
-- Each check returns rows only when something is wrong. The script ends with an
-- error if any check found anything, so psql exits non-zero and the capture
-- script records a failure.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f catalogue-checks.sql
--
-- Run it against a database branch or a local copy with the migrations applied,
-- never production. It only reads the system catalogue and writes one temporary
-- table that disappears with the session.
--
-- Not yet run against a live database by devflow's own tests. Check the output
-- on a schema you know before trusting an empty result.

create temporary table devflow_findings (check_name text, object_name text, detail text);

-- Schemas the application owns. Managed and system schemas are skipped.
create temporary view devflow_schemas as
select n.oid, n.nspname
from pg_namespace n
where n.nspname not like 'pg\_%'
  and n.nspname not in ('information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql',
                        'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks', 'net', 'cron',
                        'supabase_functions', 'supabase_migrations', '_realtime', '_analytics');

-- 1. Tables with no primary key. Rows cannot be addressed reliably, and
--    replication and many tools need one.
insert into devflow_findings
select 'no primary key', s.nspname || '.' || c.relname, 'add a primary key'
from pg_class c
join devflow_schemas s on s.oid = c.relnamespace
where c.relkind = 'r'
  and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p');

-- 2. Foreign keys with no index that starts with the same columns. Deleting or
--    updating the parent row then scans the whole child table, and joins are slow.
insert into devflow_findings
select 'foreign key not indexed', k.conrelid::regclass::text, 'constraint ' || k.conname
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join devflow_schemas s on s.oid = c.relnamespace
where k.contype = 'f'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = k.conrelid
      and i.indisvalid
      and (i.indkey::int2[])[0:cardinality(k.conkey) - 1] @> k.conkey
      and k.conkey @> (i.indkey::int2[])[0:cardinality(k.conkey) - 1]
  );

-- 3. Tables in the public schema without row-level security. On platforms that
--    expose this schema through an API, such a table is readable by any client.
insert into devflow_findings
select 'row-level security off', 'public.' || c.relname, 'enable row-level security and add policies'
from pg_class c
where c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace
  and not c.relrowsecurity;

-- 4. Tables with row-level security on but no policies. Every query returns
--    nothing, which usually means the policies were forgotten.
insert into devflow_findings
select 'row-level security with no policy', s.nspname || '.' || c.relname, 'add a policy for each operation'
from pg_class c
join devflow_schemas s on s.oid = c.relnamespace
where c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

-- 5. Policies that name no role, so they apply to everyone, including callers
--    who are not signed in.
insert into devflow_findings
select 'policy names no role', p.schemaname || '.' || p.tablename, 'policy ' || p.policyname || ': add TO <role>'
from pg_policies p
join devflow_schemas s on s.nspname = p.schemaname
where p.roles = '{public}';

-- 6. Policies that call an auth function directly. It then runs once per row.
--    Wrapping the call in a subquery lets the planner run it once.
insert into devflow_findings
select 'auth function runs per row', p.schemaname || '.' || p.tablename, 'policy ' || p.policyname || ': wrap the call as (select auth.uid())'
from pg_policies p
join devflow_schemas s on s.nspname = p.schemaname
where (coalesce(p.qual, '') ~ 'auth\.\w+\(\)' and coalesce(p.qual, '') !~* 'select auth\.\w+\(\)')
   or (coalesce(p.with_check, '') ~ 'auth\.\w+\(\)' and coalesce(p.with_check, '') !~* 'select auth\.\w+\(\)');

-- 7. Tables and columns whose names need quoting. Every query must then quote
--    them exactly, and tools that do not will fail.
insert into devflow_findings
select 'name needs quoting', s.nspname || '.' || c.relname, 'rename to lower case with underscores'
from pg_class c
join devflow_schemas s on s.oid = c.relnamespace
where c.relkind = 'r' and c.relname <> lower(c.relname);

insert into devflow_findings
select 'name needs quoting', s.nspname || '.' || c.relname || '.' || a.attname, 'rename to lower case with underscores'
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join devflow_schemas s on s.oid = c.relnamespace
where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.attname <> lower(a.attname);

-- 8. Indexes left invalid by a failed concurrent build. They take up space and
--    slow writes, but are never used.
insert into devflow_findings
select 'invalid index', i.indexrelid::regclass::text, 'drop it and build it again'
from pg_index i
join pg_class c on c.oid = i.indrelid
join devflow_schemas s on s.oid = c.relnamespace
where not i.indisvalid;

select check_name, object_name, detail from devflow_findings order by check_name, object_name;

do $$
declare
  total integer;
begin
  select count(*) into total from devflow_findings;
  if total > 0 then
    raise exception 'devflow: % catalogue finding(s), listed above', total;
  end if;
end
$$;
