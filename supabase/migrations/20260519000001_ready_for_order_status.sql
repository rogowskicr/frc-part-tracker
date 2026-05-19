-- Add 'ready_for_order' to part_status enum
alter type public.part_status add value if not exists 'ready_for_order' after 'on_hold';
