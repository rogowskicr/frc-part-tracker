-- ─── CONVERT 4-DIGIT NUMERIC PREFIXES TO 2-DIGIT FORMAT ─────────────────────
-- During the transition between the old season system and the new project system,
-- part/assembly numbers were generated with a 4-digit prefix like "2601_A_100"
-- (year "26" + old numeric suffix "01"). The correct format is "26_A_100".
--
-- This strips the 2-digit numeric suffix portion, keeping only the year prefix:
--   2601_A_100  →  26_A_100
--   2601_P_101  →  26_P_101

-- Fix assembly numbers
update public.assemblies
set assembly_number =
  left(assembly_number, 2) || substring(assembly_number from 5)
where assembly_number ~ '^\d{4}_[AP]_\d+$';

-- Fix part numbers (nullable)
update public.parts
set part_number =
  left(part_number, 2) || substring(part_number from 5)
where part_number is not null
  and part_number ~ '^\d{4}_[AP]_\d+$';
