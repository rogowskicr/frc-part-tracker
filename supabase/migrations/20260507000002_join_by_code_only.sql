-- ─── SIMPLIFY join_team: code only (drop old 3-arg version) ──────────────────
drop function if exists public.join_team(text, text, text);

create or replace function public.join_team(
  p_join_code text,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select id into v_team_id
  from public.teams
  where join_code = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Invalid join code';
  end if;

  update public.user_profiles
  set team_id = v_team_id, role = 'engineer', name = p_user_name
  where id = v_user_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'engineer')
  on conflict (user_id, team_id) do nothing;

  return v_team_id;
end;
$$;

grant execute on function public.join_team(text, text) to authenticated;

-- ─── SIMPLIFY add_team_membership: code only (drop old 2-arg version) ─────────
drop function if exists public.add_team_membership(text, text);

create or replace function public.add_team_membership(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select id into v_team_id
  from public.teams
  where join_code = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Invalid join code';
  end if;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'engineer')
  on conflict (user_id, team_id) do nothing;

  -- If the user has no active team yet, make this one active
  update public.user_profiles
  set team_id = v_team_id, role = 'engineer'
  where id = v_user_id and team_id is null;

  return v_team_id;
end;
$$;

grant execute on function public.add_team_membership(text) to authenticated;

-- ─── create_additional_team ────────────────────────────────────────────────────
-- Creates a new team for an already-authenticated user. The user becomes admin
-- and their active team switches to the new one.
create or replace function public.create_additional_team(
  p_team_name text,
  p_team_year int
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

  insert into public.teams (name, year, join_code)
  values (trim(p_team_name), p_team_year, v_code)
  returning id into v_team_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'admin');

  -- Switch active team to the newly created one
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

grant execute on function public.create_additional_team(text, int) to authenticated;
