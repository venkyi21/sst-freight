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

-- Week 8 (ADR-0012): platform monetization. billing_model picks which engine an org is on;
-- enabled_modules gates Model 1 orgs to the modules they've paid for (Model 2 orgs bypass this
-- entirely — see is_module_enabled() below). Defaulting enabled_modules to every gateable module
-- means every pre-existing org keeps working unchanged until a platform admin deliberately narrows it.
alter table organizations add column if not exists billing_model text not null default 'model_1' check (billing_model in ('model_1', 'model_2'));
alter table organizations add column if not exists monthly_fee_inr numeric not null default 0;
alter table organizations add column if not exists enabled_modules text[] not null default array['directory', 'quotes', 'accounting'];

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

-- audit_log: generic, append-only ledger for contacts/memberships/invoices/shipment_costs.
-- record_id is a deliberately polymorphic reference (no FK) since it points into four different
-- tables — this is a loose reference by design, not a modeling oversight; see ADR-0010.
-- Same "zero client-reachable path" shape as platform_admins: no RLS policy, no grant to
-- `authenticated` at all. The only writer is log_audit_event() below (SECURITY DEFINER trigger);
-- the only reader is list_audit_log() (SECURITY DEFINER RPC, bypasses RLS, admin-gated).
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_org_id_idx on audit_log (org_id);
create index if not exists audit_log_record_idx on audit_log (table_name, record_id);
alter table audit_log enable row level security;

-- platform_revenue_ledger (ADR-0013): simulated FinTech Slice rake ledger for Model 2 orgs.
-- "Simulated" is not a euphemism here — no real funds ever move via this table, it only records
-- what the platform would charge. Same "zero client-reachable path" shape as audit_log: no RLS
-- policy, no grant to `authenticated` — the only reader is list_platform_revenue() (platform-admin
-- only). Writers are the invoices fx_spread trigger below and the two opt-in RPCs.
create table if not exists platform_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  invoice_id uuid references invoices (id) on delete set null,
  shipment_cost_id uuid references shipment_costs (id) on delete set null,
  rake_type text not null check (rake_type in ('fx_spread', 'cargo_insurance', 'instant_payout')),
  rate_pct numeric not null,
  base_amount_inr numeric not null,
  rake_amount_inr numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_revenue_ledger_org_id_idx on platform_revenue_ledger (org_id);
alter table platform_revenue_ledger enable row level security;

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

-- is_module_enabled (ADR-0012): Model 2 orgs ("all modules unlocked") always return true.
-- Model 1 orgs are gated to whichever modules a platform admin has enabled for them.
create or replace function is_module_enabled(p_org_id uuid, p_module text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org organizations;
begin
  select * into v_org from organizations where id = p_org_id;
  return v_org.billing_model = 'model_2' or p_module = any(v_org.enabled_modules);
end;
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
  with check (is_org_member(org_id) and created_by = auth.uid() and is_module_enabled(org_id, 'quotes'));

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
  with check (is_org_member(org_id) and created_by = auth.uid() and is_module_enabled(org_id, 'quotes'));

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
  with check (is_org_member(org_id) and created_by = auth.uid() and is_module_enabled(org_id, 'accounting'));

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

-- log_audit_event: generic AFTER trigger reused across contacts/memberships/invoices/
-- shipment_costs (ADR-0010). Runs after any BEFORE trigger on the same table (e.g.
-- invoices_protect_fx_rate) since Postgres fires BEFORE triggers first, so it always captures
-- the final row. The DELETE branch is real but currently unreachable — none of these four
-- tables have a client delete grant yet (docs/tech-debt.md) — included now so the ledger doesn't
-- need a schema change the day delete is added.
create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- organizations is its own org (id, not org_id) — every other audited table has a real org_id
  -- column. Branching on tg_table_name avoids evaluating the field access that doesn't exist for
  -- whichever shape the current row isn't.
  if tg_table_name = 'organizations' then
    v_org_id := coalesce(new.id, old.id);
  else
    v_org_id := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  end if;

  insert into audit_log (org_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (
    v_org_id, tg_table_name, coalesce(new.id, old.id), lower(tg_op), auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists contacts_audit on contacts;
create trigger contacts_audit after insert or update or delete on contacts
  for each row execute function log_audit_event();
drop trigger if exists memberships_audit on memberships;
create trigger memberships_audit after insert or update or delete on memberships
  for each row execute function log_audit_event();
drop trigger if exists invoices_audit on invoices;
create trigger invoices_audit after insert or update or delete on invoices
  for each row execute function log_audit_event();
drop trigger if exists shipment_costs_audit on shipment_costs;
create trigger shipment_costs_audit after insert or update or delete on shipment_costs
  for each row execute function log_audit_event();

-- list_audit_log: the only reader of audit_log. Gated to Owner/Admin (or platform admin) —
-- same is_org_admin() gate as update_member_role()/remove_member(), since this ledger covers
-- financial (invoices, shipment_costs) and access-control (memberships) data.
create or replace function list_audit_log(p_org_id uuid, p_table_name text default null, p_record_id uuid default null, p_limit int default 200)
returns table (id uuid, table_name text, record_id uuid, operation text, changed_by_email text, changed_at timestamptz, old_data jsonb, new_data jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_org_admin(p_org_id) or is_platform_admin()) then
    raise exception 'Not authorized to view the audit log';
  end if;

  return query
    select l.id, l.table_name, l.record_id, l.operation, u.email::text, l.changed_at, l.old_data, l.new_data
    from audit_log l
    left join auth.users u on u.id = l.changed_by
    where l.org_id = p_org_id
      and (p_table_name is null or l.table_name = p_table_name)
      and (p_record_id is null or l.record_id = p_record_id)
    order by l.changed_at desc
    limit p_limit;
end;
$$;

-- organizations_audit (ADR-0012): reuses the same generic trigger as contacts/memberships/
-- invoices/shipment_costs — Meter-Flip history (billing_model changes) comes for free through
-- the existing audit_log/list_audit_log/AuditLogPage infrastructure, no new history table needed.
-- update only: org creation is already covered by create_organization()'s own flow.
drop trigger if exists organizations_audit on organizations;
create trigger organizations_audit after update on organizations
  for each row execute function log_audit_event();

-- fx_spread ledger trigger (ADR-0013): only fires for Model 2 orgs on a non-INR invoice, mirroring
-- the real currency conversion that already happens via fetchFxRateToInr (ADR-0007). 2% is a
-- fixed simulated rate — no real settlement occurs, this only records what the platform would take.
create or replace function log_fx_spread_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  select * into v_org from organizations where id = new.org_id;
  if v_org.billing_model = 'model_2' and new.currency <> 'INR' then
    insert into platform_revenue_ledger (org_id, invoice_id, rake_type, rate_pct, base_amount_inr, rake_amount_inr)
    values (new.org_id, new.id, 'fx_spread', 2, new.amount_inr, round(new.amount_inr * 0.02, 2));
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_fx_spread_revenue on invoices;
create trigger invoices_fx_spread_revenue after insert on invoices
  for each row execute function log_fx_spread_revenue();

-- list_all_organizations / set_org_billing_model / set_org_config / list_platform_revenue
-- (ADR-0012): the platform-wide admin RPCs ADR-0005 anticipated but deliberately deferred
-- ("e.g. 'list all organizations' — none of that exists yet"). All four are platform-admin-only.
create or replace function list_all_organizations()
returns table (id uuid, name text, billing_model text, monthly_fee_inr numeric, enabled_modules text[], created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select o.id, o.name, o.billing_model, o.monthly_fee_inr, o.enabled_modules, o.created_at
    from organizations o
    order by o.created_at desc;
end;
$$;

create or replace function set_org_billing_model(p_org_id uuid, p_model text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if p_model not in ('model_1', 'model_2') then
    raise exception 'Invalid billing model';
  end if;
  update organizations set billing_model = p_model where id = p_org_id returning * into v_org;
  return v_org;
end;
$$;

create or replace function set_org_config(p_org_id uuid, p_monthly_fee_inr numeric, p_enabled_modules text[])
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  update organizations
    set monthly_fee_inr = p_monthly_fee_inr, enabled_modules = p_enabled_modules
    where id = p_org_id
    returning * into v_org;
  return v_org;
end;
$$;

-- list_platform_revenue: p_org_id = null is the platform-wide view (platform-admin only).
-- A non-null p_org_id also allows that org's own Owner/Admin to see it — resolving the source
-- doc's own open question ("expose Model 2 revenue back to the org?") in favor of yes, scoped to
-- admins only, matching this app's existing Owner/Admin-gated transparency convention
-- (list_audit_log). See ADR-0013.
create or replace function list_platform_revenue(p_org_id uuid default null)
returns table (id uuid, org_id uuid, org_name text, invoice_id uuid, shipment_cost_id uuid, rake_type text, rate_pct numeric, base_amount_inr numeric, rake_amount_inr numeric, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    if not is_platform_admin() then
      raise exception 'Not authorized';
    end if;
  elsif not (is_org_admin(p_org_id) or is_platform_admin()) then
    raise exception 'Not authorized';
  end if;
  return query
    select l.id, l.org_id, o.name, l.invoice_id, l.shipment_cost_id, l.rake_type, l.rate_pct, l.base_amount_inr, l.rake_amount_inr, l.created_at
    from platform_revenue_ledger l
    join organizations o on o.id = l.org_id
    where p_org_id is null or l.org_id = p_org_id
    order by l.created_at desc;
end;
$$;

-- opt_in_cargo_insurance / mark_cost_instant_payout (ADR-0013): opt-in, per-record simulated
-- rakes — deliberate user actions, not automatic side effects like fx_spread above. No-ops
-- (return without inserting a ledger row) for Model 1 orgs, which have no rake-based monetization.
create or replace function opt_in_cargo_insurance(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments;
  v_org organizations;
  v_total numeric;
begin
  select * into v_shipment from shipments where id = p_shipment_id;
  if v_shipment.id is null then
    raise exception 'Shipment not found';
  end if;
  if not is_org_member(v_shipment.org_id) then
    raise exception 'Not authorized for this shipment';
  end if;

  select * into v_org from organizations where id = v_shipment.org_id;
  if v_org.billing_model <> 'model_2' then
    return;
  end if;

  select coalesce(sum(amount_inr), 0) into v_total from invoices where shipment_id = p_shipment_id;
  insert into platform_revenue_ledger (org_id, invoice_id, rake_type, rate_pct, base_amount_inr, rake_amount_inr)
  values (v_shipment.org_id, null, 'cargo_insurance', 0.8, v_total, round(v_total * 0.008, 2));
end;
$$;

create or replace function mark_cost_instant_payout(p_shipment_cost_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost shipment_costs;
  v_org organizations;
begin
  select * into v_cost from shipment_costs where id = p_shipment_cost_id;
  if v_cost.id is null then
    raise exception 'Shipment cost not found';
  end if;
  if not is_org_member(v_cost.org_id) then
    raise exception 'Not authorized for this cost';
  end if;

  select * into v_org from organizations where id = v_cost.org_id;
  if v_org.billing_model <> 'model_2' then
    return;
  end if;

  insert into platform_revenue_ledger (org_id, shipment_cost_id, rake_type, rate_pct, base_amount_inr, rake_amount_inr)
  values (v_cost.org_id, p_shipment_cost_id, 'instant_payout', 1, v_cost.amount, round(v_cost.amount * 0.01, 2));
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
grant execute on function list_audit_log(uuid, text, uuid, int) to authenticated;
grant execute on function list_all_organizations() to authenticated;
grant execute on function set_org_billing_model(uuid, text) to authenticated;
grant execute on function set_org_config(uuid, numeric, text[]) to authenticated;
grant execute on function list_platform_revenue(uuid) to authenticated;
grant execute on function opt_in_cargo_insurance(uuid) to authenticated;
grant execute on function mark_cost_instant_payout(uuid) to authenticated;

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
