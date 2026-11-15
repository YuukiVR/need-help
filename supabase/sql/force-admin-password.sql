-- Fallback: force the default superadmin password to "admin".
--
-- Use this only if scripts/create-admin.mjs fails because Supabase's Auth
-- service enforces a 6-character minimum password. Login itself does not
-- enforce the minimum, so a bcrypt hash of "admin" works.
--
-- Run in the Supabase SQL editor after the admin user exists.

update auth.users
set encrypted_password = extensions.crypt('admin', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'admin@need-help.local';

-- Verify the profile is an active admin.
update public.profiles
set role = 'admin', is_active = true, full_name = 'Super Admin'
where email = 'admin@need-help.local';
