-- Create a security definer function to complete signup
-- This runs with elevated privileges, bypassing RLS for the initial team/profile setup
create or replace function public.complete_signup(
  p_team_name text,
  p_team_year int,
  p_user_name text
)
returns uuid -- returns the new team_id
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

  -- Create the team
  insert into public.teams (name, year)
  values (p_team_name, p_team_year)
  returning id into v_team_id;

  -- Update the user profile with team + admin role
  update public.user_profiles
  set team_id = v_team_id,
      role    = 'admin',
      name    = p_user_name
  where id = v_user_id;

  -- Insert default manufacturing processes
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

-- Grant execute to authenticated users
grant execute on function public.complete_signup(text, int, text) to authenticated;
