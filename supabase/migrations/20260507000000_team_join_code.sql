-- ─── JOIN CODE HELPER ─────────────────────────────────────────────────────────
-- Generates a 6-character uppercase code from an unambiguous character set
-- (no O/0, I/1 to avoid confusion when sharing verbally)
create or replace function public.generate_join_code()
returns text language plpgsql as $$
declare
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * 32 + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- ─── ADD JOIN CODE COLUMN TO TEAMS ────────────────────────────────────────────
alter table public.teams add column if not exists join_code text;

-- Backfill existing teams
update public.teams
set join_code = public.generate_join_code()
where join_code is null;

alter table public.teams alter column join_code set not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_join_code_unique'
  ) then
    alter table public.teams add constraint teams_join_code_unique unique (join_code);
  end if;
end $$;

-- ─── UPDATE complete_signup TO GENERATE JOIN CODE ──────────────────────────────
create or replace function public.complete_signup(
  p_team_name text,
  p_team_year int,
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
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Generate a unique join code
  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'Could not generate unique join code';
    end if;
  end loop;

  insert into public.teams (name, year, join_code)
  values (p_team_name, p_team_year, v_code)
  returning id into v_team_id;

  update public.user_profiles
  set team_id = v_team_id,
      role    = 'admin',
      name    = p_user_name
  where id = v_user_id;

  insert into public.manufacturing_processes (team_id, name) values
    (v_team_id, '3D Printing'),
    (v_team_id, 'Laser Cut'),
    (v_team_id, 'CNC Mill'),
    (v_team_id, 'CNC Lathe'),
    (v_team_id, 'Hand Fabrication'),
    (v_team_id, 'Welding'),
    (v_team_id, 'Sheet Metal');

  return v_team_id;
end;
$$;

grant execute on function public.complete_signup(text, int, text) to authenticated;

-- ─── join_team RPC ─────────────────────────────────────────────────────────────
-- Lets a newly-registered user join an existing team by name + join code.
-- Runs as security definer so it can look up teams regardless of RLS.
create or replace function public.join_team(
  p_team_name text,
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
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_team_id
  from public.teams
  where lower(name) = lower(trim(p_team_name))
    and join_code    = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Team not found or incorrect join code';
  end if;

  update public.user_profiles
  set team_id = v_team_id,
      role    = 'engineer',
      name    = p_user_name
  where id = v_user_id;

  return v_team_id;
end;
$$;

grant execute on function public.join_team(text, text, text) to authenticated;
