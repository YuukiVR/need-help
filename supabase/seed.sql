-- Seed data for local development (`supabase db reset` runs this
-- automatically after the migrations).
--
-- Users must exist before this runs. Create them in Studio
-- (Authentication → Users → Add user) or with the admin API, then run
-- `supabase db reset` again. This file promotes the demo accounts if they
-- exist and inserts a few sample reports once.

do $$
declare
  v_admin     uuid;
  v_responder uuid;
  v_consumer  uuid;
  v_water     uuid;
  v_power     uuid;
begin
  select id into v_admin     from auth.users where email = 'admin@example.com';
  select id into v_responder from auth.users where email = 'responder@example.com';
  select id into v_consumer  from auth.users where email = 'consumer@example.com';

  if v_admin is not null then
    update public.profiles
       set role = 'admin', full_name = coalesce(nullif(full_name, ''), 'Admin')
     where id = v_admin;
  end if;

  if v_responder is not null then
    update public.profiles
       set role = 'responder', full_name = coalesce(nullif(full_name, ''), 'Responder')
     where id = v_responder;
  end if;

  if v_consumer is not null then
    update public.profiles
       set role = 'consumer', full_name = coalesce(nullif(full_name, ''), 'Consumer')
     where id = v_consumer;
  end if;

  -- Only insert demo reports once, and only if we have a consumer.
  -- Note: reports_normalize forces status = 'new' on insert, so the
  -- triaged demo report is moved afterwards.
  if v_consumer is not null and not exists (select 1 from public.reports) then

    insert into public.reports
      (reporter_id, type, description, address_text, lat, lng, priority, created_at)
    values
      (v_consumer, 'water',
       'No water since 6am. Whole street is dry.',
       '12 Mabini St, Barangay 1', 14.5995, 120.9842,
       'medium', now() - interval '2 hours')
    returning id into v_water;

    insert into public.reports
      (reporter_id, type, description, address_text, lat, lng, priority, created_at)
    values
      (v_consumer, 'electricity',
       'Transformer sparking near the corner store.',
       '88 Rizal Ave, Barangay 2', 14.6042, 120.9822,
       'high', now() - interval '45 minutes')
    returning id into v_power;

    insert into public.reports
      (reporter_id, type, description, address_text, lat, lng,
       is_emergency, created_at)
    values
      (v_consumer, 'fire',
       'Smoke coming from the abandoned lot behind the school.',
       'Lot 7, Sampaguita St, Barangay 3', 14.6091, 120.9822,
       true, now() - interval '5 minutes');

    update public.reports set status = 'triaged' where id = v_power;

    insert into public.report_events (report_id, author_id, kind, message)
    values (v_water, v_consumer, 'comment', 'Demo report created by seed.sql');
  end if;
end;
$$;
