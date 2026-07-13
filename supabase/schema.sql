-- SST Freight — Week 1 MVP schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: guarded with "if not exists" / "or replace" where possible.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null default '#2563eb',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  ref text not null,
  mode text not null check (mode in ('ocean', 'air', 'truck')),
  client text not null,
  origin text not null,
  destination text not null,
  status text not null default 'Booked',
  load_type text,
  container_size text,
  vessel_name text,
  voyage_no text,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  gross_weight_kg numeric,
  vehicle_type text,
  driver_phone text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, ref)
);

create index if not exists shipments_org_id_idx on shipments (org_id);
create index if not exists memberships_user_id_idx on memberships (user_id);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('shipper', 'consignee', 'overseas_agent', 'vendor')),
  vendor_type text check (vendor_type in ('trucking_company', 'cfs_agent')),
  name text not null,
  email text,
  phone text,
  city text,
  country text,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check ((kind = 'vendor') = (vendor_type is not null))
);

create index if not exists contacts_org_id_idx on contacts (org_id);

alter table shipments add column if not exists shipper_contact_id uuid references contacts (id) on delete set null;
alter table shipments add column if not exists consignee_contact_id uuid references contacts (id) on delete set null;

-- tracking_token: a dedicated public identifier for the customer tracking portal, distinct from
-- the shipment's own id — revocable independently, doesn't leak the internal PK format into a
-- public URL. `default gen_random_uuid()` is volatile, so Postgres computes a distinct value per
-- existing row during this ALTER, not one shared value.
alter table shipments add column if not exists tracking_token uuid not null default gen_random_uuid() unique;

-- Normalize any pre-existing status values (e.g. Truck's old 'Loading' default) onto the
-- 5-state machine before the check constraint below is added.
update shipments set status = 'Booked' where status not in ('Booked', 'Docs', 'Cleared', 'In Transit', 'Delivered');
alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('Booked', 'Docs', 'Cleared', 'In Transit', 'Delivered'));

-- shipment_status_history: append-only audit log. The only writers are the insert trigger
-- below (initial status) and advance_shipment_status() (every status change thereafter) —
-- no insert/update/delete grant is given to `authenticated`.
create table if not exists shipment_status_history (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists shipment_status_history_shipment_id_idx on shipment_status_history (shipment_id);
alter table shipment_status_history enable row level security;

create table if not exists tariffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  mode text not null check (mode in ('ocean', 'air', 'truck')),
  origin text not null,
  destination text not null,
  rate numeric not null check (rate > 0),
  currency text not null default 'INR',
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists tariffs_org_id_idx on tariffs (org_id);
alter table tariffs enable row level security;

-- quotes: shipper/consignee follow the same pattern as shipments — a nullable FK for
-- traceability plus a denormalized name snapshot for display without an extra join.
-- mode/origin/destination/rate are snapshotted from the tariff at creation time (not a live
-- reference), so a later tariff edit never retroactively changes an existing quote.
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  ref text not null,
  tariff_id uuid references tariffs (id) on delete set null,
  mode text not null check (mode in ('ocean', 'air', 'truck')),
  origin text not null,
  destination text not null,
  shipper_contact_id uuid references contacts (id) on delete set null,
  shipper_name text not null,
  consignee_contact_id uuid references contacts (id) on delete set null,
  consignee_name text not null,
  quantity numeric not null check (quantity > 0),
  rate numeric not null,
  currency text not null default 'INR',
  total numeric not null,
  status text not null default 'draft' check (status in ('draft', 'converted')),
  converted_shipment_id uuid references shipments (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, ref)
);
create index if not exists quotes_org_id_idx on quotes (org_id);
alter table quotes enable row level security;

-- invoices: generated from a shipment. client_contact_id/client_name follow the same FK +
-- denormalized-name pattern as quotes.consignee_*. amount_inr is stored (not computed on read)
-- so P&L totals never need a currency-conversion join.
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  ref text not null,
  shipment_id uuid not null references shipments (id) on delete cascade,
  client_contact_id uuid references contacts (id) on delete set null,
  client_name text not null,
  currency text not null default 'INR',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  amount numeric not null check (amount > 0),
  amount_inr numeric not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  due_date date,
  paid_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, ref)
);
create index if not exists invoices_org_id_idx on invoices (org_id);
alter table invoices enable row level security;

-- shipment_costs: the P&L cost side, reusing vendor contacts from Week 2.
create table if not exists shipment_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  shipment_id uuid not null references shipments (id) on delete cascade,
  vendor_contact_id uuid references contacts (id) on delete set null,
  vendor_name text,
  description text not null,
  amount numeric not null check (amount > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists shipment_costs_org_id_idx on shipment_costs (org_id);
alter table shipment_costs enable row level security;

-- platform_admins: a platform-level Super-Admin, orthogonal to any org membership.
-- No RLS policy is defined for this table and no grants are given to `authenticated` —
-- it is unreachable from the client entirely. The only way in is a manual insert via the
-- Supabase SQL editor; the only way it's ever read is through is_platform_admin() below,
-- which runs as SECURITY DEFINER and so bypasses RLS regardless.
create table if not exists platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table shipments enable row level security;
alter table contacts enable row level security;
alter table shipment_status_history enable row level security;

create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id and user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(check_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- organizations: readable only by members. No direct insert policy —
-- creation happens exclusively through create_organization() below so a
-- user can never insert a row without also getting an owner membership.
drop policy if exists "members can view their orgs" on organizations;
create policy "members can view their orgs"
  on organizations for select
  using (is_org_member(id) or is_platform_admin());

-- memberships: a user can see their own membership rows only. No direct
-- insert policy — memberships are only created via create_organization()
-- or join_organization() so a user can never self-invite into an
-- arbitrary org by guessing its id.
drop policy if exists "users can view their memberships" on memberships;
create policy "users can view their memberships"
  on memberships for select
  using (user_id = auth.uid() or is_platform_admin());

-- shipments: scoped strictly to org membership.
drop policy if exists "members can view org shipments" on shipments;
create policy "members can view org shipments"
  on shipments for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org shipments" on shipments;
create policy "members can insert org shipments"
  on shipments for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

-- No update policy/grant on shipments: status is the only mutable field in practice, and it
-- can only ever change through advance_shipment_status() below (SECURITY DEFINER), so the
-- state machine can't be bypassed by a raw client-side .update() call.
drop policy if exists "members can update org shipments" on shipments;

-- shipment_status_history: read-only for org members (and platform admins) — write access is
-- exclusively through the trigger and RPC below.
drop policy if exists "members can view org shipment status history" on shipment_status_history;
create policy "members can view org shipment status history"
  on shipment_status_history for select
  using (is_org_member(org_id) or is_platform_admin());

-- contacts: scoped strictly to org membership, same shape as shipments.
drop policy if exists "members can view org contacts" on contacts;
create policy "members can view org contacts"
  on contacts for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org contacts" on contacts;
create policy "members can insert org contacts"
  on contacts for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org contacts" on contacts;
create policy "members can update org contacts"
  on contacts for update
  using (is_org_member(org_id));

-- tariffs: scoped strictly to org membership, same shape as contacts.
drop policy if exists "members can view org tariffs" on tariffs;
create policy "members can view org tariffs"
  on tariffs for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org tariffs" on tariffs;
create policy "members can insert org tariffs"
  on tariffs for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org tariffs" on tariffs;
create policy "members can update org tariffs"
  on tariffs for update
  using (is_org_member(org_id));

-- quotes: scoped strictly to org membership, same shape as contacts. Update is needed here
-- (unlike shipments) so conversion can flip status/converted_shipment_id client-side.
drop policy if exists "members can view org quotes" on quotes;
create policy "members can view org quotes"
  on quotes for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org quotes" on quotes;
create policy "members can insert org quotes"
  on quotes for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org quotes" on quotes;
create policy "members can update org quotes"
  on quotes for update
  using (is_org_member(org_id));

-- invoices: scoped strictly to org membership, same shape as quotes. Any member can mark an
-- invoice paid/unpaid; the FX rate is additionally protected by a trigger below.
drop policy if exists "members can view org invoices" on invoices;
create policy "members can view org invoices"
  on invoices for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org invoices" on invoices;
create policy "members can insert org invoices"
  on invoices for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org invoices" on invoices;
create policy "members can update org invoices"
  on invoices for update
  using (is_org_member(org_id));

-- shipment_costs: scoped strictly to org membership, same shape as contacts.
drop policy if exists "members can view org shipment costs" on shipment_costs;
create policy "members can view org shipment costs"
  on shipment_costs for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org shipment costs" on shipment_costs;
create policy "members can insert org shipment costs"
  on shipment_costs for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org shipment costs" on shipment_costs;
create policy "members can update org shipment costs"
  on shipment_costs for update
  using (is_org_member(org_id));

-- ─────────────────────────────────────────────────────────────
-- RPCs (SECURITY DEFINER — the only way to create an org or join one)
-- ─────────────────────────────────────────────────────────────

create or replace function create_organization(p_name text, p_color text default '#2563eb')
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
  v_slug text;
  v_invite text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if trim(p_name) = '' then
    raise exception 'Organization name is required';
  end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 5);
  v_invite := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into organizations (name, slug, color, invite_code)
  values (trim(p_name), v_slug, p_color, v_invite)
  returning * into v_org;

  insert into memberships (user_id, org_id, role)
  values (auth.uid(), v_org.id, 'owner');

  return v_org;
end;
$$;

create or replace function join_organization(p_invite_code text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_org from organizations where invite_code = upper(trim(p_invite_code));
  if v_org.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into memberships (user_id, org_id, role)
  values (auth.uid(), v_org.id, 'member')
  on conflict (user_id, org_id) do nothing;

  return v_org;
end;
$$;

create or replace function list_org_members(p_org_id uuid)
returns table (membership_id uuid, user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_member(p_org_id) then
    raise exception 'Not a member of this organization';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at
    from memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by m.created_at asc;
end;
$$;

create or replace function update_member_role(p_membership_id uuid, p_new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target memberships;
begin
  if p_new_role not in ('member', 'admin') then
    raise exception 'Invalid role';
  end if;

  select * into v_target from memberships where id = p_membership_id;
  if v_target.id is null then
    raise exception 'Membership not found';
  end if;
  if not is_org_admin(v_target.org_id) then
    raise exception 'Not authorized to manage this organization''s team';
  end if;
  if v_target.role = 'owner' and not exists (
    select 1 from memberships where org_id = v_target.org_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only an owner can change another owner''s role';
  end if;

  update memberships set role = p_new_role where id = p_membership_id;
end;
$$;

create or replace function remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target memberships;
begin
  select * into v_target from memberships where id = p_membership_id;
  if v_target.id is null then
    raise exception 'Membership not found';
  end if;
  if v_target.user_id = auth.uid() then
    raise exception 'Cannot remove your own membership';
  end if;
  if not is_org_admin(v_target.org_id) then
    raise exception 'Not authorized to manage this organization''s team';
  end if;
  if v_target.role = 'owner' and not exists (
    select 1 from memberships where org_id = v_target.org_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only an owner can remove another owner';
  end if;

  delete from memberships where id = p_membership_id;
end;
$$;

create or replace function log_initial_shipment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into shipment_status_history (shipment_id, org_id, from_status, to_status, changed_by)
  values (new.id, new.org_id, null, new.status, new.created_by);
  return new;
end;
$$;

drop trigger if exists shipments_log_initial_status on shipments;
create trigger shipments_log_initial_status
  after insert on shipments
  for each row execute function log_initial_shipment_status();

create or replace function advance_shipment_status(p_shipment_id uuid)
returns shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments;
  v_sequence text[] := array['Booked', 'Docs', 'Cleared', 'In Transit', 'Delivered'];
  v_current_idx int;
  v_next_status text;
begin
  select * into v_shipment from shipments where id = p_shipment_id;
  if v_shipment.id is null then
    raise exception 'Shipment not found';
  end if;
  if not is_org_member(v_shipment.org_id) then
    raise exception 'Not authorized to update this shipment';
  end if;

  v_current_idx := array_position(v_sequence, v_shipment.status);
  if v_current_idx = array_length(v_sequence, 1) then
    raise exception 'Shipment is already at the final status';
  end if;
  v_next_status := v_sequence[v_current_idx + 1];

  update shipments set status = v_next_status where id = p_shipment_id returning * into v_shipment;

  insert into shipment_status_history (shipment_id, org_id, from_status, to_status, changed_by)
  values (v_shipment.id, v_shipment.org_id, v_sequence[v_current_idx], v_next_status, auth.uid());

  return v_shipment;
end;
$$;

create or replace function list_shipment_status_history(p_shipment_id uuid)
returns table (from_status text, to_status text, changed_by_email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from shipments where id = p_shipment_id;
  if v_org_id is null or not is_org_member(v_org_id) then
    raise exception 'Not authorized to view this shipment''s history';
  end if;

  return query
    select h.from_status, h.to_status, u.email::text, h.created_at
    from shipment_status_history h
    join auth.users u on u.id = h.changed_by
    where h.shipment_id = p_shipment_id
    order by h.created_at asc;
end;
$$;

create or replace function protect_invoice_fx_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fx_rate is distinct from old.fx_rate and not is_org_admin(old.org_id) then
    raise exception 'Only an Owner/Admin can edit the FX rate';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_protect_fx_rate on invoices;
create trigger invoices_protect_fx_rate
  before update on invoices
  for each row execute function protect_invoice_fx_rate();

-- get_public_shipment_tracking: the sole public, no-auth entry point for the customer tracking
-- portal (Week 7). Callable by `anon` — the only thing standing between a stranger and this data
-- is the tracking_token itself, so the returned payload is deliberately minimal: no staff email,
-- no fx_rate, no vendor/cost data, no internal shipment id. No RLS policy changes are needed on
-- shipments/shipment_status_history/invoices for this — SECURITY DEFINER bypasses RLS here the
-- same way every other RPC in this app already does.
create or replace function get_public_shipment_tracking(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments;
  v_result jsonb;
begin
  select * into v_shipment from shipments where tracking_token = p_token;
  if v_shipment.id is null then
    raise exception 'Tracking link not found';
  end if;

  select jsonb_build_object(
    'ref', v_shipment.ref,
    'mode', v_shipment.mode,
    'origin', v_shipment.origin,
    'destination', v_shipment.destination,
    'status', v_shipment.status,
    'client_name', v_shipment.client,
    'created_at', v_shipment.created_at,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'from_status', h.from_status, 'to_status', h.to_status, 'created_at', h.created_at
      ) order by h.created_at asc), '[]'::jsonb)
      from shipment_status_history h where h.shipment_id = v_shipment.id
    ),
    'invoices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ref', i.ref, 'currency', i.currency, 'amount', i.amount,
        'amount_inr', i.amount_inr, 'status', i.status, 'due_date', i.due_date
      ) order by i.created_at asc), '[]'::jsonb)
      from invoices i where i.shipment_id = v_shipment.id
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function create_organization(text, text) to authenticated;
grant execute on function join_organization(text) to authenticated;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function is_org_admin(uuid) to authenticated;
grant execute on function is_platform_admin() to authenticated;
grant execute on function list_org_members(uuid) to authenticated;
grant execute on function update_member_role(uuid, text) to authenticated;
grant execute on function remove_member(uuid) to authenticated;
grant execute on function advance_shipment_status(uuid) to authenticated;
grant execute on function list_shipment_status_history(uuid) to authenticated;
grant execute on function get_public_shipment_tracking(uuid) to anon, authenticated;

grant select on organizations to authenticated;
grant select on memberships to authenticated;
grant select, insert on shipments to authenticated;
-- Older versions of this script granted UPDATE directly on shipments; revoke it explicitly since
-- GRANT is additive and re-running the (now update-less) grant line above does not undo it —
-- status must only ever change through advance_shipment_status().
revoke update on shipments from authenticated;
grant select, insert, update on contacts to authenticated;
grant select on shipment_status_history to authenticated;
grant select, insert, update on tariffs to authenticated;
grant select, insert, update on quotes to authenticated;
grant select, insert, update on invoices to authenticated;
grant select, insert, update on shipment_costs to authenticated;
