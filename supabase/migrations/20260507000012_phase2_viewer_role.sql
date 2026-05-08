-- ─── PHASE 2b: TIGHTEN VIEWER ROLE ENFORCEMENT ───────────────────────────────
-- The initial schema already blocks viewers from INSERT/UPDATE/DELETE on parts,
-- assemblies, bom_items, manufacturing_processes, and part_manufacturing.
-- The part_status_history insert policy was missing the role check — fix it.

drop policy if exists "part_history_team_insert" on public.part_status_history;

create policy "part_history_team_insert" on public.part_status_history
  for insert with check (
    exists (select 1 from public.parts p where p.id = part_id and p.team_id = public.my_team_id())
    and public.my_role() in ('admin', 'engineer')
  );

notify pgrst, 'reload schema';
