-- Fix: allow authenticated users to create a new team (needed for signup flow)
-- At signup time the user has no team_id yet, so we just check they're authenticated
create policy "team_insert_authenticated" on public.teams
  for insert with check (auth.uid() is not null);

-- Also allow authenticated users to insert their own profile row
-- (needed if the trigger fires before RLS is evaluated in some edge cases)
create policy "profiles_own_insert" on public.user_profiles
  for insert with check (id = auth.uid());
