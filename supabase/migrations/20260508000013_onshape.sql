-- ─── PHASE 3: ONSHAPE INTEGRATION ────────────────────────────────────────────

-- OnShape credentials per team (isolated table so viewers cannot read secrets)
create table if not exists public.team_onshape_credentials (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  access_key text,
  secret_key text,
  updated_at timestamptz not null default now()
);

alter table public.team_onshape_credentials enable row level security;

-- Only team admins can read or write credentials
create policy "onshape_creds_admin" on public.team_onshape_credentials
  for all using (
    team_id = public.my_team_id()
    and public.my_role() = 'admin'
  );

-- ─── EXTEND assemblies WITH ONSHAPE SYNC FIELDS ───────────────────────────────
alter table public.assemblies
  add column if not exists onshape_element_id   text,
  add column if not exists onshape_workspace_id text,
  add column if not exists onshape_last_sync    timestamptz;

-- ─── EXTEND parts WITH ONSHAPE SYNC FIELDS ────────────────────────────────────
alter table public.parts
  add column if not exists onshape_part_id       text,
  add column if not exists onshape_element_id    text,
  add column if not exists onshape_workspace_id  text,
  add column if not exists onshape_thumbnail_url text;

-- ─── BOM CACHE (avoid hammering OnShape API) ──────────────────────────────────
create table if not exists public.onshape_bom_cache (
  team_id    uuid        not null references public.teams(id) on delete cascade,
  cache_key  text        not null,   -- "{docId}/{wid}/{elementId}"
  bom_json   jsonb       not null,
  fetched_at timestamptz not null default now(),
  primary key (team_id, cache_key)
);

alter table public.onshape_bom_cache enable row level security;

create policy "onshape_cache_team" on public.onshape_bom_cache
  for all using (team_id = public.my_team_id());

-- ─── SYNC DIFF HISTORY ────────────────────────────────────────────────────────
-- Stores pending diffs before user confirms and applies them.
create table if not exists public.onshape_sync_diffs (
  id            uuid        primary key default gen_random_uuid(),
  team_id       uuid        not null references public.teams(id)      on delete cascade,
  assembly_id   uuid        not null references public.assemblies(id) on delete cascade,
  created_at    timestamptz not null default now(),
  added_parts   jsonb       not null default '[]'::jsonb,
  removed_parts jsonb       not null default '[]'::jsonb,
  changed_parts jsonb       not null default '[]'::jsonb,
  applied       bool        not null default false,
  applied_at    timestamptz
);

alter table public.onshape_sync_diffs enable row level security;

create policy "sync_diffs_team" on public.onshape_sync_diffs
  for all using (team_id = public.my_team_id());

-- ─── RPC: save_onshape_credentials ────────────────────────────────────────────
create or replace function public.save_onshape_credentials(
  p_team_id    uuid,
  p_access_key text,
  p_secret_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.team_memberships
    where user_id = auth.uid()
      and team_id  = p_team_id
      and role     = 'admin'
  ) then
    raise exception 'Only team admins can manage OnShape credentials';
  end if;

  insert into public.team_onshape_credentials (team_id, access_key, secret_key, updated_at)
  values (p_team_id, p_access_key, p_secret_key, now())
  on conflict (team_id) do update
    set access_key = excluded.access_key,
        secret_key = excluded.secret_key,
        updated_at = now();
end;
$$;

grant execute on function public.save_onshape_credentials(uuid, text, text) to authenticated;

-- ─── RPC: get_onshape_credentials ─────────────────────────────────────────────
-- Returns credentials for any team member (server-side API routes use this).
-- The raw keys never leave the Next.js server.
create or replace function public.get_onshape_credentials(
  p_team_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_key text;
  v_secret_key text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.team_memberships
    where user_id = auth.uid()
      and team_id  = p_team_id
  ) then
    raise exception 'Not a member of this team';
  end if;

  select access_key, secret_key
    into v_access_key, v_secret_key
    from public.team_onshape_credentials
   where team_id = p_team_id;

  if v_access_key is null then
    return null;
  end if;

  return jsonb_build_object(
    'access_key', v_access_key,
    'secret_key', v_secret_key
  );
end;
$$;

grant execute on function public.get_onshape_credentials(uuid) to authenticated;

-- ─── RPC: has_onshape_credentials ─────────────────────────────────────────────
-- Returns true if the team has OnShape credentials configured.
-- Any team member can call this (used for UI state).
create or replace function public.has_onshape_credentials(
  p_team_id uuid
) returns bool
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.team_memberships
    where user_id = auth.uid()
      and team_id  = p_team_id
  ) then
    raise exception 'Not a member of this team';
  end if;

  return exists (
    select 1 from public.team_onshape_credentials
    where team_id   = p_team_id
      and access_key is not null
      and secret_key is not null
  );
end;
$$;

grant execute on function public.has_onshape_credentials(uuid) to authenticated;
