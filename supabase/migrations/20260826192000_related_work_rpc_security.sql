-- These RPCs call private authorization helpers. Execute them with the function
-- owner's schema privileges while retaining the explicit access checks, empty
-- search path, and authenticated-only grants defined in the original migration.
alter function public.get_related_work_group(uuid) security definer;
alter function public.set_related_work_group(uuid, uuid[], text) security definer;
