-- ─── REPLACE team_projects WITH LETTER-SUFFIX VARIANT ────────────────────────
-- New format:
--   No suffix  →  2-char code "26"   →  part numbers like  26_A_100
--   Letter "A" →  3-char code "26A"  →  part numbers like  26A_A_100
--
-- Empty string '' means "no suffix" (base project for the year).
-- Single uppercase letter means an additional project for that year.

drop table if exists public.team_projects cascade;

create table public.team_projects (
  team_id    uuid    not null references public.teams(id) on delete cascade,
  year       integer not null check (year >= 2000 and year <= 2099),
  suffix     text    not null default '' check (suffix = '' or suffix ~ '^[A-Z]$'),
  created_at timestamptz not null default now(),
  primary key (team_id, year, suffix)
);

alter table public.team_projects enable row level security;

create policy "team_projects_read" on public.team_projects
  for select using (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_projects.team_id
    )
  );

create policy "team_projects_admin_insert" on public.team_projects
  for insert with check (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_projects.team_id and role = 'admin'
    )
  );

create policy "team_projects_admin_delete" on public.team_projects
  for delete using (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_projects.team_id and role = 'admin'
    )
  );

-- Migrate from team_seasons — all become base projects (no suffix).
insert into public.team_projects (team_id, year, suffix)
select team_id, year, ''
from public.team_seasons
on conflict do nothing;

-- ─── ACTIVE PROJECT IN USER PROFILE ──────────────────────────────────────────
-- Add column if it doesn't exist yet (migration 009 may not have been applied).
alter table public.user_profiles
  add column if not exists active_project_code text;

-- If migration 009 was applied and left 4-digit codes like "2601", convert to "26".
update public.user_profiles
set active_project_code = left(active_project_code, 2)
where active_project_code is not null
  and active_project_code ~ '^\d{4}$';

-- ─── add_team_project (text suffix) ──────────────────────────────────────────
drop function if exists public.add_team_project(uuid, integer, integer, uuid);

create or replace function public.add_team_project(
  p_team_id   uuid,
  p_year      integer,
  p_suffix    text,
  p_caller_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_year < 2000 or p_year > 2099 then
    raise exception 'Year must be between 2000 and 2099';
  end if;
  if p_suffix <> '' and p_suffix !~ '^[A-Z]$' then
    raise exception 'Suffix must be empty or a single letter A–Z';
  end if;

  select role into v_role
  from public.team_memberships
  where user_id = p_caller_id and team_id = p_team_id;

  if v_role is distinct from 'admin' then
    raise exception 'Only admins can add projects';
  end if;

  insert into public.team_projects (team_id, year, suffix)
  values (p_team_id, p_year, upper(p_suffix))
  on conflict (team_id, year, suffix) do nothing;
end;
$$;

grant execute on function public.add_team_project(uuid, integer, text, uuid) to authenticated;

-- ─── remove_team_project (text suffix) ───────────────────────────────────────
drop function if exists public.remove_team_project(uuid, integer, integer, uuid);

create or replace function public.remove_team_project(
  p_team_id   uuid,
  p_year      integer,
  p_suffix    text,
  p_caller_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.team_memberships
  where user_id = p_caller_id and team_id = p_team_id;

  if v_role is distinct from 'admin' then
    raise exception 'Only admins can remove projects';
  end if;

  delete from public.team_projects
  where team_id = p_team_id and year = p_year and suffix = upper(p_suffix);
end;
$$;

grant execute on function public.remove_team_project(uuid, integer, text, uuid) to authenticated;

-- ─── set_active_project (2- or 3-char code) ──────────────────────────────────
create or replace function public.set_active_project(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
  v_year    integer;
  v_suffix  text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select team_id into v_team_id
  from public.user_profiles
  where id = v_user_id;

  if v_team_id is null then
    raise exception 'No active team';
  end if;

  if p_code is not null then
    -- Valid formats: "26" (2 digits) or "26A" (2 digits + 1 letter)
    if p_code !~ '^\d{2}[A-Z]?$' then
      raise exception 'Invalid project code — must be 2 digits or 2 digits + a letter (e.g. "26" or "26A")';
    end if;

    v_year   := 2000 + (left(p_code, 2))::integer;
    v_suffix := case when length(p_code) = 3 then right(p_code, 1) else '' end;

    if not exists (
      select 1 from public.team_projects
      where team_id = v_team_id and year = v_year and suffix = v_suffix
    ) then
      raise exception 'Project % does not exist for this team', p_code;
    end if;
  end if;

  update public.user_profiles
  set active_project_code = p_code
  where id = v_user_id;
end;
$$;

grant execute on function public.set_active_project(text) to authenticated;

notify pgrst, 'reload schema';
