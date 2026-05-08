-- ─── MAKE teams.year NULLABLE ──────────────────────────────────────────────────
-- Season years are now managed per-team via the team_seasons table.
alter table public.teams alter column year drop not null;
alter table public.teams alter column year set default null;

-- ─── TEAM SEASONS TABLE ───────────────────────────────────────────────────────
-- Explicit registry of season years for a team. Admins add seasons; any member
-- can set their active season to switch their view context.
create table if not exists public.team_seasons (
  team_id    uuid    not null references public.teams(id) on delete cascade,
  year       integer not null check (year >= 2000 and year <= 2099),
  created_at timestamptz not null default now(),
  primary key (team_id, year)
);

alter table public.team_seasons enable row level security;

-- Any team member can read their team's seasons
create policy "team_seasons_read" on public.team_seasons
  for select using (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_seasons.team_id
    )
  );

-- Only admins can add seasons
create policy "team_seasons_admin_insert" on public.team_seasons
  for insert with check (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_seasons.team_id and role = 'admin'
    )
  );

-- Only admins can delete seasons
create policy "team_seasons_admin_delete" on public.team_seasons
  for delete using (
    exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = team_seasons.team_id and role = 'admin'
    )
  );

-- ─── ACTIVE SEASON IN USER PROFILE ───────────────────────────────────────────
alter table public.user_profiles
  add column if not exists active_season_year integer;

-- ─── UPDATE complete_signup: remove year parameter ────────────────────────────
drop function if exists public.complete_signup(text, int, text);

create or replace function public.complete_signup(
  p_team_name text,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id  uuid;
  v_user_id  uuid;
  v_code     text;
  v_attempts int := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then raise exception 'Could not generate unique join code'; end if;
  end loop;

  insert into public.teams (name, join_code)
  values (p_team_name, v_code)
  returning id into v_team_id;

  update public.user_profiles
  set team_id = v_team_id, role = 'admin', name = p_user_name
  where id = v_user_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'admin')
  on conflict (user_id, team_id) do update set role = 'admin';

  insert into public.manufacturing_processes (team_id, name) values
    (v_team_id, '3D Printing'), (v_team_id, 'Laser Cut'), (v_team_id, 'CNC Mill'),
    (v_team_id, 'CNC Lathe'), (v_team_id, 'Hand Fabrication'), (v_team_id, 'Welding'),
    (v_team_id, 'Sheet Metal');

  return v_team_id;
end;
$$;

grant execute on function public.complete_signup(text, text) to authenticated;

-- ─── UPDATE create_additional_team: remove year parameter ─────────────────────
drop function if exists public.create_additional_team(text, int);

create or replace function public.create_additional_team(p_team_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id  uuid;
  v_user_id  uuid;
  v_code     text;
  v_attempts int := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then raise exception 'Could not generate unique join code'; end if;
  end loop;

  insert into public.teams (name, join_code)
  values (trim(p_team_name), v_code)
  returning id into v_team_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'admin');

  update public.user_profiles
  set team_id = v_team_id, role = 'admin'
  where id = v_user_id;

  insert into public.manufacturing_processes (team_id, name) values
    (v_team_id, '3D Printing'), (v_team_id, 'Laser Cut'), (v_team_id, 'CNC Mill'),
    (v_team_id, 'CNC Lathe'), (v_team_id, 'Hand Fabrication'), (v_team_id, 'Welding'),
    (v_team_id, 'Sheet Metal');

  return v_team_id;
end;
$$;

grant execute on function public.create_additional_team(text) to authenticated;

-- ─── add_team_season ──────────────────────────────────────────────────────────
-- Admin-only: register a new season year for a team.
create or replace function public.add_team_season(
  p_team_id   uuid,
  p_year      integer,
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

  select role into v_role
  from public.team_memberships
  where user_id = p_caller_id and team_id = p_team_id;

  if v_role is distinct from 'admin' then
    raise exception 'Only admins can add season years';
  end if;

  insert into public.team_seasons (team_id, year)
  values (p_team_id, p_year)
  on conflict (team_id, year) do nothing;
end;
$$;

grant execute on function public.add_team_season(uuid, integer, uuid) to authenticated;

-- ─── remove_team_season ───────────────────────────────────────────────────────
-- Admin-only: remove a season year from a team.
create or replace function public.remove_team_season(
  p_team_id   uuid,
  p_year      integer,
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
    raise exception 'Only admins can remove season years';
  end if;

  delete from public.team_seasons
  where team_id = p_team_id and year = p_year;
end;
$$;

grant execute on function public.remove_team_season(uuid, integer, uuid) to authenticated;

-- ─── set_active_season ────────────────────────────────────────────────────────
-- Any authenticated user: set their active season year (must belong to their team).
-- Pass NULL to clear the active season (show all seasons).
create or replace function public.set_active_season(p_year integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select team_id into v_team_id
  from public.user_profiles
  where id = v_user_id;

  if v_team_id is null then
    raise exception 'No active team';
  end if;

  if p_year is not null and not exists (
    select 1 from public.team_seasons where team_id = v_team_id and year = p_year
  ) then
    raise exception 'Season % does not exist for this team', p_year;
  end if;

  update public.user_profiles
  set active_season_year = p_year
  where id = v_user_id;
end;
$$;

grant execute on function public.set_active_season(integer) to authenticated;

-- ─── UPDATE switch_active_team: clear active season on team switch ─────────────
-- Seasons are team-specific; clear the active season when switching teams.
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
  set team_id = p_team_id, role = v_role, active_season_year = null
  where id = v_user_id;
end;
$$;

grant execute on function public.switch_active_team(uuid) to authenticated;
