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

drop policy if exists "members can update org shipments" on shipments;
create policy "members can update org shipments"
  on shipments for update
  using (is_org_member(org_id));

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

grant execute on function create_organization(text, text) to authenticated;
grant execute on function join_organization(text) to authenticated;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function is_org_admin(uuid) to authenticated;
grant execute on function is_platform_admin() to authenticated;
grant execute on function list_org_members(uuid) to authenticated;
grant execute on function update_member_role(uuid, text) to authenticated;
grant execute on function remove_member(uuid) to authenticated;

grant select on organizations to authenticated;
grant select on memberships to authenticated;
grant select, insert, update on shipments to authenticated;
grant select, insert, update on contacts to authenticated;
