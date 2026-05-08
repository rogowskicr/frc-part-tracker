-- ─── TEAM PROJECTS TABLE ──────────────────────────────────────────────────────
-- Replaces team_seasons. Each project is identified by a (year, suffix) pair.
-- The 4-character part-number prefix is: last2(year) || zero-padded(suffix)
-- e.g.  year=2026, suffix=1  →  prefix "2601"  →  parts like 2601_A_100
create table if not exists public.team_projects (
  team_id    uuid    not null references public.teams(id) on delete cascade,
  year       integer not null check (year >= 2000 and year <= 2099),
  suffix     integer not null default 1 check (suffix >= 1 and suffix <= 99),
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

-- ─── MIGRATE FROM team_seasons ────────────────────────────────────────────────
-- All existing seasons become project suffix 01.
insert into public.team_projects (team_id, year, suffix)
select team_id, year, 1
from public.team_seasons
on conflict do nothing;

-- ─── ACTIVE PROJECT IN USER PROFILE ──────────────────────────────────────────
-- 4-char text code, e.g. "2601". NULL = no active project (view all).
alter table public.user_profiles
  add column if not exists active_project_code text;

-- Migrate existing active_season_year → active_project_code (suffix 01)
update public.user_profiles
set active_project_code =
  lpad(((active_season_year % 100))::text, 2, '0') || '01'
where active_season_year is not null
  and active_project_code is null;

-- ─── add_team_project ─────────────────────────────────────────────────────────
drop function if exists public.add_team_season(uuid, integer, uuid);

create or replace function public.add_team_project(
  p_team_id   uuid,
  p_year      integer,
  p_suffix    integer,
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
  if p_suffix < 1 or p_suffix > 99 then
    raise exception 'Suffix must be between 1 and 99';
  end if;

  select role into v_role
  from public.team_memberships
  where user_id = p_caller_id and team_id = p_team_id;

  if v_role is distinct from 'admin' then
    raise exception 'Only admins can add projects';
  end if;

  insert into public.team_projects (team_id, year, suffix)
  values (p_team_id, p_year, p_suffix)
  on conflict (team_id, year, suffix) do nothing;
end;
$$;

grant execute on function public.add_team_project(uuid, integer, integer, uuid) to authenticated;

-- ─── remove_team_project ──────────────────────────────────────────────────────
drop function if exists public.remove_team_season(uuid, integer, uuid);

create or replace function public.remove_team_project(
  p_team_id   uuid,
  p_year      integer,
  p_suffix    integer,
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
  where team_id = p_team_id and year = p_year and suffix = p_suffix;
end;
$$;

grant execute on function public.remove_team_project(uuid, integer, integer, uuid) to authenticated;

-- ─── set_active_project ───────────────────────────────────────────────────────
-- Sets the user's active project by its 4-char code (e.g. "2601"), or NULL to clear.
drop function if exists public.set_active_season(integer);

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
  v_suffix  integer;
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
    if p_code !~ '^\d{4}$' then
      raise exception 'Invalid project code — must be 4 digits (e.g. 2601)';
    end if;

    v_year   := 2000 + (left(p_code, 2))::integer;
    v_suffix := (right(p_code, 2))::integer;

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

-- ─── UPDATE switch_active_team: clear active project on team switch ────────────
create or replace function public.switch_active_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role    text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select role into v_role
  from public.team_memberships
  where user_id = v_user_id and team_id = p_team_id;

  if v_role is null then
    raise exception 'You are not a member of this team';
  end if;

  update public.user_profiles
  set team_id = p_team_id, role = v_role, active_project_code = null
  where id = v_user_id;
end;
$$;

grant execute on function public.switch_active_team(uuid) to authenticated;

-- ─── UPDATE leave_team: clear active project when leaving active team ──────────
create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_next_id   uuid;
  v_next_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  delete from public.team_memberships
  where user_id = v_user_id and team_id = p_team_id;

  if exists (
    select 1 from public.user_profiles
    where id = v_user_id and team_id = p_team_id
  ) then
    select tm.team_id, tm.role
    into v_next_id, v_next_role
    from public.team_memberships tm
    where tm.user_id = v_user_id
    order by tm.joined_at desc
    limit 1;

    update public.user_profiles
    set team_id             = v_next_id,
        role                = coalesce(v_next_role, 'engineer'),
        active_project_code = null
    where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.leave_team(uuid) to authenticated;

-- Force PostgREST schema cache refresh.
notify pgrst, 'reload schema';
