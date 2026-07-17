-- SST Freight — Week 1 MVP schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: guarded with "if not exists" / "or replace" where possible.

create extension if not exists pgcrypto;
-- http (ADR-0014): lets a SECURITY DEFINER function make an outbound HTTPS call (Terminal49's
-- carrier-tracking API) from inside Postgres, keeping the API key server-side — this app has no
-- other backend to hide a secret in (ADR-0001).
create extension if not exists http;

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

-- White-label branding: logo_url points into the org-logos Storage bucket (public — see below).
-- Nullable — no logo means the existing letter-avatar-on-color fallback renders instead.
alter table organizations add column if not exists logo_url text;

-- Week 14 (ADR-0021): the org's own home state, for GST place-of-supply comparison against a
-- billed contact's state (see contacts.state below). Nullable — unset until an Owner/Admin fills
-- it in via update_org_gst_settings(); invoices default to inter-state/IGST until then.
alter table organizations add column if not exists gst_state text;

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

-- Week 14 (ADR-0021): state, for GST place-of-supply comparison against organizations.gst_state.
-- Nullable — every contact created before this starts unset; invoices to an unset-state contact
-- default to inter-state/IGST (the safer assumption) until someone fills this in.
alter table contacts add column if not exists state text;

-- Week 15 (ADR-0022): archive, not hard delete — a contact referenced by historical quotes/
-- invoices keeps its FK intact (ADR-0003's nullable-FK-plus-snapshot pattern already tolerates
-- this), just hidden from default lists/autocomplete. Plain client-updatable, same shape as
-- invoices.status ("mark paid/unpaid" is already a plain update) — no RPC needed.
alter table contacts add column if not exists archived boolean not null default false;

create index if not exists contacts_org_id_idx on contacts (org_id);

alter table shipments add column if not exists shipper_contact_id uuid references contacts (id) on delete set null;
alter table shipments add column if not exists consignee_contact_id uuid references contacts (id) on delete set null;

-- tracking_token: a dedicated public identifier for the customer tracking portal, distinct from
-- the shipment's own id — revocable independently, doesn't leak the internal PK format into a
-- public URL. `default gen_random_uuid()` is volatile, so Postgres computes a distinct value per
-- existing row during this ALTER, not one shared value.
alter table shipments add column if not exists tracking_token uuid not null default gen_random_uuid() unique;

-- Week 9 (ADR-0014): carrier tracking registration via Terminal49. The free API plan is
-- write-only (can create a tracking request, cannot read status back — no webhooks, no GET
-- access) — confirmed with a real API call, not assumed. These columns record that registration
-- happened; there is no live status field because the plan genuinely cannot retrieve one.
alter table shipments add column if not exists carrier_scac text;
alter table shipments add column if not exists carrier_request_number text;
alter table shipments add column if not exists carrier_tracking_request_id text;
alter table shipments add column if not exists carrier_tracking_registered_at timestamptz;

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

-- Week 14 (ADR-0021): optional prefill source for a quote's freight line item. sac_code is a
-- Services Accounting Code (India's GST classification for services), deliberately distinct from
-- the hs_codes table above — hs_codes is goods-import-duty data for the Week 10 Customs Filing
-- Simulator, a different real-world tax concept from the GST a forwarder charges on its own
-- freight/THC/documentation service fees. Both nullable — freight forwarding predates this
-- feature, existing tariffs have neither until edited.
alter table tariffs add column if not exists sac_code text;
alter table tariffs add column if not exists default_gst_rate numeric check (default_gst_rate is null or default_gst_rate >= 0);

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
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'converted')),
  converted_shipment_id uuid references shipments (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, ref)
);
create index if not exists quotes_org_id_idx on quotes (org_id);
alter table quotes enable row level security;

-- Week 15 (ADR-0022): the fresh-install check constraint above already allows the wider status
-- set, but `create table if not exists` is a no-op against a pre-existing dev table — this
-- drop-then-add pair is what actually widens it there. Same for rejection_reason/archived below.
alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check check (status in ('draft', 'sent', 'accepted', 'rejected', 'converted'));

-- rejection_reason: nullable, optional at the moment a quote is marked 'rejected' — turns a dead
-- quote into real win/loss signal instead of silence. archived: same plain-update shape as
-- contacts.archived above.
alter table quotes add column if not exists rejection_reason text;
alter table quotes add column if not exists archived boolean not null default false;

-- validate_quote_status_transition (ADR-0022): quotes' new lifecycle is a *branching* state
-- machine (draft -> sent -> accepted/rejected, plus a direct draft/sent/accepted -> converted
-- shortcut), unlike shipments' single linear sequence (ADR-0004's advance_shipment_status()
-- RPC). The closer precedent already in this codebase is invoices_protect_fx_rate below/above —
-- a `before update` trigger that rejects a specific column change unless a condition holds, not a
-- new RPC (ADR-0002: no privileged/cross-role logic here, just an ordering rule). `rejected` and
-- `converted` are terminal, no backward transitions — same "no go-back" stance ADR-0004 already
-- took for shipments. A no-op whenever `status` itself isn't changing, so archiving or any other
-- column update on a quote is never blocked by this trigger.
create or replace function validate_quote_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Real double-submit race, found by direct verification (2026-07-15), not just reasoned about:
  -- two near-simultaneous "Convert" clicks each insert their OWN new shipment, then both race to
  -- set status='converted' — the SAME target value both times. Postgres's row lock serializes the
  -- two updates, but once the first commits, the second sees old.status already = 'converted' =
  -- new.status, so the status no-op branch below (needed to let non-status-touching updates like
  -- archiving through) would silently allow it too, defeating the whole point. Guarding
  -- converted_shipment_id's immutability once set is what actually closes this: the first commit
  -- locks in which shipment a quote converted to, and the second racing update is rejected for
  -- trying to change it, regardless of what it does with status.
  if old.converted_shipment_id is not null and new.converted_shipment_id is distinct from old.converted_shipment_id then
    raise exception 'A quote''s converted_shipment_id cannot change once set (quote %)', old.id;
  end if;

  if new.status = old.status then
    return new;
  end if;
  if (old.status, new.status) not in (
    ('draft', 'sent'), ('draft', 'converted'),
    ('sent', 'accepted'), ('sent', 'rejected'), ('sent', 'converted'),
    ('accepted', 'converted')
  ) then
    raise exception 'Invalid quote status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_validate_status_transition on quotes;
create trigger quotes_validate_status_transition
  before update on quotes
  for each row execute function validate_quote_status_transition();

-- quote_line_items (Week 14, ADR-0021): itemized breakdown (freight/THC/documentation, etc.) as
-- separate rows. Additive alongside quotes.rate/quantity/total, not a replacement — a quote with
-- no line items still works exactly as before, using those existing columns; total becomes
-- sum(line items) only once line items exist. Own org_id (not inferred via a join), same shape
-- as shipment_costs. select/insert only — no update/delete grant, matching that no quote-editing
-- UI exists at all today (tech-debt.md), so there is nothing to edit or remove after creation.
create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  quote_id uuid not null references quotes (id) on delete cascade,
  description text not null,
  sac_code text,
  quantity numeric not null check (quantity > 0),
  rate numeric not null,
  currency text not null default 'INR',
  amount numeric not null check (amount >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists quote_line_items_org_id_idx on quote_line_items (org_id);
create index if not exists quote_line_items_quote_id_idx on quote_line_items (quote_id);
alter table quote_line_items enable row level security;

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

-- Week 15 (ADR-0022): archive, same plain-update shape as contacts.archived above.
alter table invoices add column if not exists archived boolean not null default false;

-- invoice_line_items (Week 14, ADR-0021): same additive shape as quote_line_items, plus the GST
-- breakup. taxable_value/cgst_amount/sgst_amount/igst_amount/line_total are all stored, not
-- derived on read — same reasoning as invoices.amount_inr. Tax-type split (CGST+SGST vs IGST) is
-- computed client-side at creation time by comparing organizations.gst_state to the invoice's
-- billed contact's state; when that contact's state is unset, the client defaults to
-- inter-state/IGST (see ADR-0021) rather than guessing a same-state split.
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  sac_code text,
  quantity numeric not null check (quantity > 0),
  rate numeric not null,
  currency text not null default 'INR',
  taxable_value numeric not null check (taxable_value >= 0),
  gst_rate numeric not null default 0 check (gst_rate >= 0),
  cgst_amount numeric not null default 0 check (cgst_amount >= 0),
  sgst_amount numeric not null default 0 check (sgst_amount >= 0),
  igst_amount numeric not null default 0 check (igst_amount >= 0),
  line_total numeric not null check (line_total >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists invoice_line_items_org_id_idx on invoice_line_items (org_id);
create index if not exists invoice_line_items_invoice_id_idx on invoice_line_items (invoice_id);
alter table invoice_line_items enable row level security;

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

-- hs_codes (Week 10, ADR-0016): the first *global*, non-org-scoped reference table in this
-- schema — a shared HS/tariff-classification lookup, not tenant data. Seeded with a
-- representative snapshot of real, published Indian Customs duty rates across common
-- goods categories (electronics, textiles, auto parts, chemicals, machinery); it is not
-- live-synced to CBIC tariff notifications (see docs/tech-debt.md). This is what the
-- Customs Filing Simulator's duty transparency/validation differentiator is built on — a
-- real reference lookup instead of accepting whatever code appears on the invoice.
create table if not exists hs_codes (
  hs_code text primary key,
  description text not null,
  basic_customs_duty_pct numeric not null check (basic_customs_duty_pct >= 0),
  igst_pct numeric not null check (igst_pct >= 0),
  social_welfare_surcharge_pct numeric not null default 10 check (social_welfare_surcharge_pct >= 0),
  created_at timestamptz not null default now()
);
alter table hs_codes enable row level security;

insert into hs_codes (hs_code, description, basic_customs_duty_pct, igst_pct, social_welfare_surcharge_pct) values
  ('8517.12', 'Mobile phones (smartphones)', 0, 18, 10),
  ('8471.30', 'Laptops / notebook computers', 0, 18, 10),
  ('8528.72', 'LED/LCD television receivers', 20, 18, 10),
  ('8415.10', 'Split air conditioners', 20, 28, 10),
  ('8450.11', 'Household washing machines', 20, 18, 10),
  ('6109.10', 'Cotton T-shirts, knitted', 15, 12, 10),
  ('6203.42', 'Men''s cotton trousers', 15, 12, 10),
  ('5208.11', 'Woven cotton fabric, unbleached', 10, 5, 10),
  ('8708.29', 'Motor vehicle body parts & accessories', 15, 28, 10),
  ('8708.99', 'Motor vehicle parts, other', 15, 28, 10),
  ('8409.91', 'Engine parts for spark-ignition engines', 7.5, 28, 10),
  ('8483.10', 'Transmission shafts and cranks', 7.5, 18, 10),
  ('2933.99', 'Heterocyclic compounds (pharma intermediates)', 5, 18, 10),
  ('3004.90', 'Medicaments, packaged for retail sale', 5, 12, 10),
  ('3901.10', 'Polyethylene, primary form', 5, 18, 10),
  ('8479.89', 'Industrial machinery, n.e.s.', 7.5, 18, 10),
  ('8413.70', 'Centrifugal pumps', 7.5, 18, 10),
  ('7308.90', 'Structures of iron or steel', 10, 18, 10),
  ('9403.20', 'Metal furniture', 20, 18, 10),
  ('4202.22', 'Handbags with outer surface of textile material', 20, 18, 10),
  ('8544.42', 'Electric conductors/cables, fitted with connectors', 10, 18, 10),
  ('3926.90', 'Articles of plastics, other', 10, 18, 10)
on conflict (hs_code) do nothing;

-- customs_filings (Week 10, ADR-0016): Bill of Entry (import) / Shipping Bill (export)
-- simulator. Org-scoped, same plain-RLS-gated-CRUD shape as tariffs/quotes — a privileged
-- RPC isn't warranted here per ADR-0002/0006. shipment_id/shipper/consignee follow the
-- established nullable-FK + denormalized-snapshot pattern (ADR-0003). Duty amounts are
-- computed client-side at submission (same convention as quotes.total) using the real
-- Indian customs stacking order: BCD on assessable value, SWS on BCD, IGST on
-- (assessable value + BCD + SWS) — not a live government filing (see ADR-0016).
create table if not exists customs_filings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  ref text not null,
  filing_type text not null check (filing_type in ('bill_of_entry', 'shipping_bill')),
  shipment_id uuid references shipments (id) on delete set null,
  shipper_contact_id uuid references contacts (id) on delete set null,
  shipper_name text,
  consignee_contact_id uuid references contacts (id) on delete set null,
  consignee_name text,
  goods_description text not null,
  hs_code text references hs_codes (hs_code),
  assessable_value_inr numeric not null check (assessable_value_inr > 0),
  bcd_amount_inr numeric not null default 0,
  sws_amount_inr numeric not null default 0,
  igst_amount_inr numeric not null default 0,
  total_duty_inr numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'filed', 'cleared')),
  filed_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, ref)
);
create index if not exists customs_filings_org_id_idx on customs_filings (org_id);
alter table customs_filings enable row level security;

-- shipment_documents (Week 11, ADR-0017): a log of shipping documents against a shipment —
-- Bill of Lading, Packing List, Certificate of Origin, Commercial Invoice, or other. A
-- `generated` row is NOT a file snapshot: the document is rendered live from the shipment's own
-- current data (shipment/contacts/quotes/invoices/customs_filings) on every view, so it always
-- reflects the latest corrected data instead of risking a stale copy — this row is just a log
-- entry that the document was issued (type, ref, when, by whom). An `uploaded` row is a real file
-- in the `shipment-documents` Storage bucket (see below), addressed by storage_path/file_name.
create table if not exists shipment_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  shipment_id uuid not null references shipments (id) on delete cascade,
  document_type text not null check (document_type in ('bill_of_lading', 'packing_list', 'certificate_of_origin', 'commercial_invoice', 'scmtr_compliance_report', 'other')),
  source text not null check (source in ('generated', 'uploaded')),
  ref text,
  file_name text,
  storage_path text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists shipment_documents_org_id_idx on shipment_documents (org_id);
create index if not exists shipment_documents_shipment_id_idx on shipment_documents (shipment_id);
alter table shipment_documents enable row level security;

-- shipment-documents Storage bucket (Week 11, ADR-0017): the first use of Supabase Storage in
-- this app — private bucket, 10MB cap. Objects are stored at `{org_id}/{shipment_id}/{uuid}-
-- {filename}`; the RLS policies below extract the org_id path segment and check it with the same
-- is_org_member() every Postgres RLS policy in this app already uses — Storage RLS is not a
-- different security model, just applied to storage.objects instead of an app table.
insert into storage.buckets (id, name, public, file_size_limit)
values ('shipment-documents', 'shipment-documents', false, 10485760)
on conflict (id) do nothing;

-- org-logos Storage bucket (white-label branding): the first *public* bucket in this app —
-- contrast with shipment-documents above (private, signed URLs). A company logo isn't sensitive
-- the way a shipment's customs documents are, so public + getPublicUrl() is the simpler right fit
-- (no signed-URL expiry/re-fetch complexity for an <img> tag rendered on every page load). Path
-- is `{org_id}/logo` — fixed, not uuid-per-upload, because a logo is current mutable state ("what
-- is this org's logo right now"), not an immutable log entry like shipment_documents; uploading a
-- new one overwrites the old one (`upsert: true`), there is no "logo history" concept. 2MB cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('org-logos', 'org-logos', true, 2097152)
on conflict (id) do nothing;

-- dashboard_preferences (Week 12, ADR-0018): "configurable dashboards per user" is literally
-- per-user, not per-org — the first table in this schema whose RLS checks auth.uid() = user_id
-- in addition to org membership, so a teammate in the same org can never see or change another
-- member's own dashboard layout. Reordering (drag-and-drop) is out of scope this pass; sort_order
-- exists for future use but v1 only ever writes/reads visibility toggles.
create table if not exists dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  widget_key text not null,
  visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, widget_key)
);
create index if not exists dashboard_preferences_org_user_idx on dashboard_preferences (org_id, user_id);
alter table dashboard_preferences enable row level security;

-- user_onboarding_state (GAP 03, ADR-0024): the second user-scoped table in this schema, same
-- auth.uid() = user_id + is_org_member(org_id) shape ADR-0018 established for
-- dashboard_preferences above. Unlike that table (per-widget rows), this is a flat one-row-per-
-- user flag — step completion itself is derived client-side from whether the org already has
-- real contacts/quotes/shipments/invoices, not stored here, so the only thing worth persisting is
-- whether the user dismissed the checklist.
create table if not exists user_onboarding_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists user_onboarding_state_org_user_idx on user_onboarding_state (org_id, user_id);
alter table user_onboarding_state enable row level security;

-- esign_requests (ADR-0020): tracks a DocuSign envelope sent for a Quote or a Bill of Lading.
-- The actual DocuSign call (JWT signing + Envelopes API) happens in the docusign-envelope Edge
-- Function, not a Postgres RPC — RS256 JWT signing has no viable in-Postgres path (pgjwt is
-- HMAC-only). This table is just org-scoped state, plain RLS-gated CRUD like customs_filings/
-- shipment_documents (ADR-0002/0006) — the Edge Function itself uses the caller's own JWT (not a
-- service role) when it reads/writes here, so RLS enforces org membership exactly as everywhere
-- else in this app.
create table if not exists esign_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  document_type text not null check (document_type in ('quote', 'bill_of_lading')),
  quote_id uuid references quotes (id) on delete cascade,
  shipment_id uuid references shipments (id) on delete cascade,
  envelope_id text,
  recipient_name text not null,
  recipient_email text not null,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'completed', 'declined', 'voided')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((document_type = 'quote') = (quote_id is not null)),
  check ((document_type = 'bill_of_lading') = (shipment_id is not null))
);
create index if not exists esign_requests_org_id_idx on esign_requests (org_id);
alter table esign_requests enable row level security;

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

-- quote_line_items: scoped strictly to org membership, same module gate as their parent quote.
-- select/insert only — no update/update policy, matching that quotes have no editing UI.
drop policy if exists "members can view org quote line items" on quote_line_items;
create policy "members can view org quote line items"
  on quote_line_items for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org quote line items" on quote_line_items;
create policy "members can insert org quote line items"
  on quote_line_items for insert
  with check (is_org_member(org_id) and created_by = auth.uid() and is_module_enabled(org_id, 'quotes'));

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

-- invoice_line_items: scoped strictly to org membership, same module gate as their parent
-- invoice. select/insert only — no update policy, matching that invoices have no editing UI.
drop policy if exists "members can view org invoice line items" on invoice_line_items;
create policy "members can view org invoice line items"
  on invoice_line_items for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org invoice line items" on invoice_line_items;
create policy "members can insert org invoice line items"
  on invoice_line_items for insert
  with check (is_org_member(org_id) and created_by = auth.uid() and is_module_enabled(org_id, 'accounting'));

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

-- hs_codes: the exception to every policy above — global reference data, visible to every
-- authenticated user regardless of org, no tenant boundary applies. No insert/update/delete
-- policy exists; the only writer is the seed insert in schema.sql above.
drop policy if exists "authenticated can view hs codes" on hs_codes;
create policy "authenticated can view hs codes"
  on hs_codes for select
  to authenticated
  using (true);

-- customs_filings: scoped strictly to org membership, same shape as tariffs/quotes.
drop policy if exists "members can view org customs filings" on customs_filings;
create policy "members can view org customs filings"
  on customs_filings for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org customs filings" on customs_filings;
create policy "members can insert org customs filings"
  on customs_filings for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org customs filings" on customs_filings;
create policy "members can update org customs filings"
  on customs_filings for update
  using (is_org_member(org_id));

-- shipment_documents: scoped strictly to org membership, same shape as customs_filings. No
-- update/delete grant this pass — a mistaken upload gets a new row rather than editing/deleting
-- the old one (see docs/tech-debt.md), avoiding an orphaned Storage object from a partial delete.
drop policy if exists "members can view org shipment documents" on shipment_documents;
create policy "members can view org shipment documents"
  on shipment_documents for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org shipment documents" on shipment_documents;
create policy "members can insert org shipment documents"
  on shipment_documents for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

-- storage.objects (shipment-documents bucket): path convention is {org_id}/{shipment_id}/
-- {uuid}-{filename} — (storage.foldername(name))[1] is the org_id segment, checked with the
-- same is_org_member() every other RLS policy in this app uses.
drop policy if exists "members can view org shipment document files" on storage.objects;
create policy "members can view org shipment document files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'shipment-documents' and is_org_member((storage.foldername(name))[1]::uuid));

drop policy if exists "members can upload org shipment document files" on storage.objects;
create policy "members can upload org shipment document files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'shipment-documents' and is_org_member((storage.foldername(name))[1]::uuid));

-- org-logos: public bucket, so read is open to everyone (no role restriction) — the logo needs
-- to render for every member, and it's not sensitive data. Writes are tighter than
-- shipment-documents' any-member-insert: only that org's own Owner/Admin (is_org_admin) can
-- replace a logo, and both insert and update are needed since re-uploading overwrites the same
-- fixed `{org_id}/logo` path (upsert), unlike shipment-documents' uuid-per-upload convention.
drop policy if exists "anyone can view org logos" on storage.objects;
create policy "anyone can view org logos"
  on storage.objects for select
  using (bucket_id = 'org-logos');

drop policy if exists "org admins can upload their org logo" on storage.objects;
create policy "org admins can upload their org logo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'org-logos' and is_org_admin((storage.foldername(name))[1]::uuid));

drop policy if exists "org admins can replace their org logo" on storage.objects;
create policy "org admins can replace their org logo"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'org-logos' and is_org_admin((storage.foldername(name))[1]::uuid));

-- dashboard_preferences: the first policy in this schema that checks auth.uid() = user_id in
-- addition to org membership — a plain "is_org_member" policy would let any teammate read/edit
-- another member's personal dashboard layout, which is not the intent of "per user".
drop policy if exists "users can view their own dashboard preferences" on dashboard_preferences;
create policy "users can view their own dashboard preferences"
  on dashboard_preferences for select
  using (auth.uid() = user_id and is_org_member(org_id));

drop policy if exists "users can insert their own dashboard preferences" on dashboard_preferences;
create policy "users can insert their own dashboard preferences"
  on dashboard_preferences for insert
  with check (auth.uid() = user_id and is_org_member(org_id));

drop policy if exists "users can update their own dashboard preferences" on dashboard_preferences;
create policy "users can update their own dashboard preferences"
  on dashboard_preferences for update
  using (auth.uid() = user_id and is_org_member(org_id));

-- user_onboarding_state: identical shape to dashboard_preferences above (ADR-0024) — a teammate
-- in the same org must never see or dismiss another member's own onboarding checklist.
drop policy if exists "users can view their own onboarding state" on user_onboarding_state;
create policy "users can view their own onboarding state"
  on user_onboarding_state for select
  using (auth.uid() = user_id and is_org_member(org_id));

drop policy if exists "users can insert their own onboarding state" on user_onboarding_state;
create policy "users can insert their own onboarding state"
  on user_onboarding_state for insert
  with check (auth.uid() = user_id and is_org_member(org_id));

drop policy if exists "users can update their own onboarding state" on user_onboarding_state;
create policy "users can update their own onboarding state"
  on user_onboarding_state for update
  using (auth.uid() = user_id and is_org_member(org_id));

-- esign_requests: scoped strictly to org membership, same shape as customs_filings/
-- shipment_documents. Update is needed so the docusign-envelope Edge Function can write a
-- refreshed status back onto an existing row.
drop policy if exists "members can view org esign requests" on esign_requests;
create policy "members can view org esign requests"
  on esign_requests for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members can insert org esign requests" on esign_requests;
create policy "members can insert org esign requests"
  on esign_requests for insert
  with check (is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "members can update org esign requests" on esign_requests;
create policy "members can update org esign requests"
  on esign_requests for update
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

-- update_org_branding: white-label logo/color. No plain grant exists on `organizations` at all
-- (every prior update path — set_org_billing_model/set_org_config — is platform-admin only) so
-- self-service editing of an org's own identity fields needed its own RPC, gated to that org's
-- own Owner/Admin (is_org_admin), not a platform admin.
create or replace function update_org_branding(p_org_id uuid, p_color text, p_logo_url text default null)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if not is_org_admin(p_org_id) then
    raise exception 'Not authorized to update this organization''s branding';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Color must be a 6-digit hex value, e.g. #2563eb';
  end if;

  update organizations set color = p_color, logo_url = p_logo_url where id = p_org_id returning * into v_org;
  if v_org.id is null then
    raise exception 'Organization not found';
  end if;

  return v_org;
end;
$$;

-- update_org_gst_settings (Week 14, ADR-0021): the org's home state, for GST place-of-supply
-- comparison on invoices. Same shape as update_org_branding above — organizations has no plain
-- grant at all, so even this single-column, non-privileged-in-spirit update needs its own
-- is_org_admin()-gated RPC, kept separate from update_org_branding since tax config and branding
-- are unrelated concerns that happen to both live on organizations.
create or replace function update_org_gst_settings(p_org_id uuid, p_gst_state text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if not is_org_admin(p_org_id) then
    raise exception 'Not authorized to update this organization''s GST settings';
  end if;

  update organizations set gst_state = p_gst_state where id = p_org_id returning * into v_org;
  if v_org.id is null then
    raise exception 'Organization not found';
  end if;

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
    ),
    -- Week 11 (ADR-0017): visibility only — type/ref/date, never file_name/storage_path, so an
    -- uploaded file is never reachable through this anon-facing payload.
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'document_type', d.document_type, 'ref', d.ref, 'created_at', d.created_at
      ) order by d.created_at asc), '[]'::jsonb)
      from shipment_documents d where d.shipment_id = v_shipment.id
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
-- Week 15 (ADR-0022): quotes wasn't audited before now — with a real branching lifecycle
-- (validate_quote_status_transition above) worth having a history for, it joins the other
-- five tables here.
drop trigger if exists quotes_audit on quotes;
create trigger quotes_audit after insert or update or delete on quotes
  for each row execute function log_audit_event();
drop trigger if exists shipment_costs_audit on shipment_costs;
create trigger shipment_costs_audit after insert or update or delete on shipment_costs
  for each row execute function log_audit_event();
drop trigger if exists customs_filings_audit on customs_filings;
create trigger customs_filings_audit after insert or update or delete on customs_filings
  for each row execute function log_audit_event();
drop trigger if exists shipment_documents_audit on shipment_documents;
create trigger shipment_documents_audit after insert or update or delete on shipment_documents
  for each row execute function log_audit_event();
drop trigger if exists esign_requests_audit on esign_requests;
create trigger esign_requests_audit after insert or update or delete on esign_requests
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

-- register_carrier_tracking (ADR-0014): registers a shipment for tracking with Terminal49 via a
-- real outbound HTTPS call from inside this SECURITY DEFINER function (the http extension) — the
-- API key never reaches the client. Write-only by design: the free Terminal49 plan cannot read
-- status back via API (confirmed with a real call — GET requests are rejected with "no
-- permissions... except for creating tracking requests"), so this only records that registration
-- happened; there is no matching "refresh" RPC because there is nothing it could fetch.
-- Handles the 'duplicate' case (already registered) by recovering the existing tracking_request_id
-- instead of failing, since re-registering the same shipment is a normal, expected action.
create or replace function register_carrier_tracking(p_shipment_id uuid, p_scac text, p_request_number text)
returns shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment shipments;
  v_response http_response;
  v_body jsonb;
  v_tracking_request_id text;
  v_api_key text;
begin
  select * into v_shipment from shipments where id = p_shipment_id;
  if v_shipment.id is null then
    raise exception 'Shipment not found';
  end if;
  if not is_org_member(v_shipment.org_id) then
    raise exception 'Not authorized for this shipment';
  end if;

  -- The API key lives in Supabase Vault, not in this committed file — see the one-time setup
  -- step in docs/migration-runbook.md. Never hardcode a real secret into schema.sql; it would be
  -- permanently visible in git history the moment this file is committed.
  select decrypted_secret into v_api_key from vault.decrypted_secrets where name = 'terminal49_api_key';
  if v_api_key is null then
    raise exception 'terminal49_api_key is not configured in Supabase Vault';
  end if;

  select * into v_response from http((
    'POST',
    'https://api.terminal49.com/v2/tracking_requests',
    ARRAY[http_header('Authorization', 'Token ' || v_api_key)],
    'application/vnd.api+json',
    jsonb_build_object(
      'data', jsonb_build_object(
        'type', 'tracking_request',
        'attributes', jsonb_build_object(
          'request_type', 'bill_of_lading',
          'request_number', p_request_number,
          'scac', p_scac
        )
      )
    )::text
  )::http_request);

  v_body := v_response.content::jsonb;

  if v_response.status = 201 then
    v_tracking_request_id := v_body -> 'data' ->> 'id';
  elsif v_response.status = 422 and v_body -> 'errors' -> 0 ->> 'code' = 'duplicate' then
    v_tracking_request_id := v_body -> 'errors' -> 0 -> 'meta' ->> 'tracking_request_id';
  else
    raise exception 'Terminal49 request failed (status %): %', v_response.status, v_response.content;
  end if;

  update shipments
    set carrier_scac = p_scac,
        carrier_request_number = p_request_number,
        carrier_tracking_request_id = v_tracking_request_id,
        carrier_tracking_registered_at = now()
    where id = p_shipment_id
    returning * into v_shipment;

  return v_shipment;
end;
$$;

grant execute on function create_organization(text, text) to authenticated;
grant execute on function update_org_branding(uuid, text, text) to authenticated;
grant execute on function update_org_gst_settings(uuid, text) to authenticated;
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
grant execute on function register_carrier_tracking(uuid, text, text) to authenticated;

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
grant select, insert on quote_line_items to authenticated;
grant select, insert, update on invoices to authenticated;
grant select, insert on invoice_line_items to authenticated;
grant select, insert, update on shipment_costs to authenticated;
grant select on hs_codes to authenticated;
grant select, insert, update on customs_filings to authenticated;
grant select, insert on shipment_documents to authenticated;
grant select, insert, update on dashboard_preferences to authenticated;
grant select, insert, update on user_onboarding_state to authenticated;
grant select, insert, update on esign_requests to authenticated;

-- ============================================================================================
-- Week 18 (ADR-0029), Phase A — Public API keys: org-scoped bearer keys resolved inside
-- SECURITY DEFINER read RPCs granted to `anon`. Scales the get_public_shipment_tracking
-- precedent (ADR-0008: possession of an opaque credential IS the authorization) from one token
-- per shipment to one key per org. Grants/revokes are colocated here (not in the central block
-- above) so this section is one self-contained, re-runnable snippet for the SQL editor.
-- ============================================================================================

-- api_keys: zero-client-reachable, same shape as audit_log — RLS on, NO policies, NO grants.
-- The plaintext key never exists in any row (only its SHA-256 hex digest); even the hash is
-- unreachable except through the definer RPCs below. key_prefix exists purely so the UI can
-- show "sst_live_a1b2c3…" for recognition.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index if not exists api_keys_org_id_idx on api_keys (org_id);
alter table api_keys enable row level security;

-- create_api_key: Owner/Admin only (same is_org_admin gate as list_audit_log — a live API key
-- reads the org's whole shipment/quote/invoice surface, firmly not a Member power). Returns the
-- full plaintext key exactly once, in this response; only the hash is stored.
-- search_path includes `extensions`: Supabase installs pgcrypto there, not in public —
-- gen_random_bytes()/digest() are invisible under a bare `public` search_path (found the hard
-- way in QA-A: "function gen_random_bytes(integer) does not exist").
create or replace function create_api_key(p_org_id uuid, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not is_org_admin(p_org_id) then
    raise exception 'Only an Owner or Admin can create API keys';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'API key label is required';
  end if;

  -- hex, not base64: base64's +/= are hostile inside curl commands and HTTP headers.
  v_key := 'sst_live_' || encode(gen_random_bytes(24), 'hex');

  insert into api_keys (org_id, label, key_prefix, key_hash, created_by)
  values (p_org_id, trim(p_label), left(v_key, 15), encode(digest(v_key, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'label', trim(p_label), 'key_prefix', left(v_key, 15), 'api_key', v_key);
end;
$$;

-- list_api_keys: prefix only — the hash never leaves the table, the plaintext never existed.
create or replace function list_api_keys(p_org_id uuid)
returns table (id uuid, label text, key_prefix text, created_by_email text, created_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_org_admin(p_org_id) or is_platform_admin()) then
    raise exception 'Only an Owner or Admin can view API keys';
  end if;

  return query
    select k.id, k.label, k.key_prefix, u.email::text, k.created_at, k.revoked_at, k.last_used_at
    from api_keys k
    left join auth.users u on u.id = k.created_by
    where k.org_id = p_org_id
    order by k.created_at desc;
end;
$$;

-- revoke_api_key: revoke-not-delete (ADR-0022's archive stance applied to credentials) — the
-- row stays as a record of the key's existence and last use. Idempotent on re-call.
create or replace function revoke_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from api_keys where id = p_key_id;
  if v_org_id is null then
    raise exception 'API key not found';
  end if;
  if not is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can revoke API keys';
  end if;

  update api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key_id;
end;
$$;

-- resolve_api_key: internal-only resolver shared by every api_* read RPC. NOT client-callable —
-- see the explicit revoke below (Postgres grants EXECUTE to PUBLIC on new functions by default,
-- and this is the first function in this schema where that default is genuinely dangerous: it
-- returns the stored row, and PostgREST would otherwise expose it at /rpc/resolve_api_key).
-- The last_used_at touch is throttled to once a minute so a chatty integration doesn't turn
-- every read into a write.
create or replace function resolve_api_key(p_api_key text)
returns api_keys
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key api_keys;
begin
  select * into v_key
  from api_keys
  where key_hash = encode(digest(coalesce(p_api_key, ''), 'sha256'), 'hex')
    and revoked_at is null;

  if v_key.id is null then
    raise exception 'Invalid or revoked API key';
  end if;

  if v_key.last_used_at is null or v_key.last_used_at < now() - interval '1 minute' then
    update api_keys set last_used_at = now() where id = v_key.id;
  end if;

  return v_key;
end;
$$;

-- api_list_shipments / api_get_shipment / api_list_quotes / api_list_invoices: the public read
-- surface. Payload minimalism copies get_public_shipment_tracking (ADR-0017 stance): org-unique
-- `ref` is the external identifier — no internal uuids, no storage_path/file_name, no fx_rate
-- beyond invoice basics, no staff emails. p_limit clamps to 200.
create or replace function api_list_shipments(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key api_keys;
begin
  v_key := resolve_api_key(p_api_key);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'ref', s.ref, 'mode', s.mode, 'client', s.client, 'origin', s.origin,
      'destination', s.destination, 'status', s.status, 'vessel_name', s.vessel_name,
      'voyage_no', s.voyage_no, 'created_at', s.created_at
    ) order by s.created_at desc)
    from (
      select * from shipments s2
      where s2.org_id = v_key.org_id and (p_status is null or s2.status = p_status)
      order by s2.created_at desc
      limit least(coalesce(p_limit, 100), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) s
  ), '[]'::jsonb);
end;
$$;

create or replace function api_get_shipment(p_api_key text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key api_keys;
  v_shipment shipments;
begin
  v_key := resolve_api_key(p_api_key);

  select * into v_shipment from shipments where org_id = v_key.org_id and ref = p_ref;
  if v_shipment.id is null then
    raise exception 'Shipment not found';
  end if;

  return jsonb_build_object(
    'ref', v_shipment.ref,
    'mode', v_shipment.mode,
    'client', v_shipment.client,
    'origin', v_shipment.origin,
    'destination', v_shipment.destination,
    'status', v_shipment.status,
    'vessel_name', v_shipment.vessel_name,
    'voyage_no', v_shipment.voyage_no,
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
    ),
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'document_type', d.document_type, 'ref', d.ref, 'created_at', d.created_at
      ) order by d.created_at asc), '[]'::jsonb)
      from shipment_documents d where d.shipment_id = v_shipment.id
    )
  );
end;
$$;

create or replace function api_list_quotes(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key api_keys;
begin
  v_key := resolve_api_key(p_api_key);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'ref', q.ref, 'mode', q.mode, 'origin', q.origin, 'destination', q.destination,
      'shipper_name', q.shipper_name, 'consignee_name', q.consignee_name,
      'total', q.total, 'currency', q.currency, 'status', q.status,
      'rejection_reason', q.rejection_reason, 'created_at', q.created_at
    ) order by q.created_at desc)
    from (
      select * from quotes q2
      where q2.org_id = v_key.org_id and (p_status is null or q2.status = p_status)
      order by q2.created_at desc
      limit least(coalesce(p_limit, 100), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function api_list_invoices(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key api_keys;
begin
  v_key := resolve_api_key(p_api_key);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'ref', i.ref, 'shipment_ref', i.shipment_ref, 'client_name', i.client_name,
      'currency', i.currency, 'amount', i.amount, 'amount_inr', i.amount_inr,
      'status', i.status, 'due_date', i.due_date, 'paid_at', i.paid_at,
      'created_at', i.created_at
    ) order by i.created_at desc)
    from (
      select i2.*, s.ref as shipment_ref from invoices i2
      join shipments s on s.id = i2.shipment_id
      where i2.org_id = v_key.org_id and (p_status is null or i2.status = p_status)
      order by i2.created_at desc
      limit least(coalesce(p_limit, 100), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) i
  ), '[]'::jsonb);
end;
$$;

-- Grants & revokes for this section. The revoke is load-bearing: without it, PUBLIC's default
-- EXECUTE would let anon call resolve_api_key directly via PostgREST.
revoke execute on function resolve_api_key(text) from public, anon, authenticated;
grant execute on function create_api_key(uuid, text) to authenticated;
grant execute on function list_api_keys(uuid) to authenticated;
grant execute on function revoke_api_key(uuid) to authenticated;
grant execute on function api_list_shipments(text, text, int, int) to anon, authenticated;
grant execute on function api_get_shipment(text, text) to anon, authenticated;
grant execute on function api_list_quotes(text, text, int, int) to anon, authenticated;
grant execute on function api_list_invoices(text, text, int, int) to anon, authenticated;

-- ============================================================================================
-- Week 18 (ADR-0029), Phase B — Outbound webhooks: transactional outbox + pg_cron poller.
-- Capture triggers (log_audit_event shape) snapshot event payloads into webhook_deliveries;
-- deliver_pending_webhooks() POSTs them (register_carrier_tracking's http() shape) on a
-- pg_cron minute schedule with exponential backoff. Delivery NEVER runs inside the user's
-- transaction — a dead endpoint can never block an invoice insert.
--
-- PREREQUISITE (one-time, manual): enable the pg_cron extension in the Supabase dashboard
-- (Database -> Extensions -> pg_cron) BEFORE running this section — see docs/migration-runbook.md.
-- ============================================================================================

-- webhook_endpoints: org-scoped, admin-only (the signing secret is admin-eyes-only, so even
-- SELECT is is_org_admin-gated — stricter than the usual is_org_member read policy). The secret
-- is server-generated by the column default; pgcrypto lives in the `extensions` schema on
-- Supabase, hence the qualified call. No delete grant — disable via enabled=false (ADR-0022).
create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  url text not null check (url like 'https://%'),
  secret text not null default 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex'),
  event_types text[] not null default array['shipment.status_changed','quote.sent','quote.accepted','quote.rejected','invoice.created','invoice.paid','document.uploaded'],
  enabled boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (event_types <@ array['shipment.status_changed','quote.sent','quote.accepted','quote.rejected','invoice.created','invoice.paid','document.uploaded']::text[])
);
create index if not exists webhook_endpoints_org_id_idx on webhook_endpoints (org_id);
alter table webhook_endpoints enable row level security;

drop policy if exists "admins can view org webhook endpoints" on webhook_endpoints;
create policy "admins can view org webhook endpoints" on webhook_endpoints for select
  using (is_org_admin(org_id) or is_platform_admin());
drop policy if exists "admins can insert org webhook endpoints" on webhook_endpoints;
create policy "admins can insert org webhook endpoints" on webhook_endpoints for insert
  with check (is_org_admin(org_id) and created_by = auth.uid());
drop policy if exists "admins can update org webhook endpoints" on webhook_endpoints;
create policy "admins can update org webhook endpoints" on webhook_endpoints for update
  using (is_org_admin(org_id));

grant select, insert, update on webhook_endpoints to authenticated;

-- webhook_deliveries: the outbox. Zero-client-reachable (audit_log shape — RLS on, no policies,
-- no grants): written only by the capture triggers, updated only by the poller, read only via
-- the admin-gated list_webhook_deliveries() below. payload is snapshotted at capture time
-- (event semantics — a later edit to the row doesn't rewrite history), wrapped in a versioned
-- envelope: {"version":"1","event_type":...,"occurred_at":...,"data":{...}}.
create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  endpoint_id uuid not null references webhook_endpoints (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status_code int,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_pending_idx on webhook_deliveries (next_attempt_at) where status = 'pending';
create index if not exists webhook_deliveries_endpoint_idx on webhook_deliveries (endpoint_id, created_at desc);
create index if not exists webhook_deliveries_org_id_idx on webhook_deliveries (org_id);
alter table webhook_deliveries enable row level security;

-- enqueue_webhook_event: fan-out helper shared by every capture trigger — one outbox row per
-- enabled endpoint whose event_types matches. Orgs with no webhooks pay one cheap indexed
-- select per event, zero rows. Internal-only (revoked below, same reasoning as resolve_api_key).
create or replace function enqueue_webhook_event(p_org_id uuid, p_event_type text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into webhook_deliveries (org_id, endpoint_id, event_type, payload)
  select p_org_id, e.id, p_event_type,
         jsonb_build_object('version', '1', 'event_type', p_event_type, 'occurred_at', now(), 'data', p_data)
  from webhook_endpoints e
  where e.org_id = p_org_id and e.enabled and p_event_type = any (e.event_types);
end;
$$;

-- Capture triggers: all AFTER (they must observe the final row and coexist with the *_audit
-- triggers), all SECURITY DEFINER, one small function each (log_fx_spread_revenue shape).

-- shipment.status_changed: hooked on shipment_status_history rather than shipments — one hook
-- catches both writers (the initial-status insert trigger and advance_shipment_status()), and
-- from_status/to_status are already first-class columns. from_status null = shipment created.
create or replace function capture_shipment_status_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  select ref into v_ref from shipments where id = new.shipment_id;
  perform enqueue_webhook_event(new.org_id, 'shipment.status_changed',
    jsonb_build_object('shipment_ref', v_ref, 'from_status', new.from_status, 'to_status', new.to_status));
  return new;
end;
$$;
drop trigger if exists shipment_status_history_webhook on shipment_status_history;
create trigger shipment_status_history_webhook after insert on shipment_status_history
  for each row execute function capture_shipment_status_webhook();

-- quote.sent / quote.accepted / quote.rejected: status-change updates only (the WHEN guard means
-- archiving or editing a quote never enqueues anything). draft/converted transitions are
-- deliberately not events — 'converted' is visible as the resulting shipment's own events.
create or replace function capture_quote_status_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('sent', 'accepted', 'rejected') then
    perform enqueue_webhook_event(new.org_id, 'quote.' || new.status,
      jsonb_build_object('ref', new.ref, 'status', new.status, 'total', new.total,
        'currency', new.currency, 'shipper_name', new.shipper_name,
        'consignee_name', new.consignee_name, 'rejection_reason', new.rejection_reason));
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_webhook on quotes;
create trigger quotes_webhook after update on quotes
  for each row when (old.status is distinct from new.status)
  execute function capture_quote_status_webhook();

-- invoice.created / invoice.paid
create or replace function capture_invoice_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform enqueue_webhook_event(new.org_id,
    case when tg_op = 'INSERT' then 'invoice.created' else 'invoice.paid' end,
    jsonb_build_object('ref', new.ref, 'client_name', new.client_name, 'currency', new.currency,
      'amount', new.amount, 'amount_inr', new.amount_inr, 'status', new.status,
      'due_date', new.due_date, 'paid_at', new.paid_at));
  return new;
end;
$$;
drop trigger if exists invoices_webhook_insert on invoices;
create trigger invoices_webhook_insert after insert on invoices
  for each row execute function capture_invoice_webhook();
drop trigger if exists invoices_webhook_update on invoices;
create trigger invoices_webhook_update after update on invoices
  for each row when (old.status is distinct from new.status and new.status = 'paid')
  execute function capture_invoice_webhook();

-- document.uploaded: real uploads only ('generated' documents are rendered live per ADR-0017 —
-- their creation isn't an integration-worthy event). Never storage_path (same stance as the
-- public tracking payload).
create or replace function capture_document_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  select ref into v_ref from shipments where id = new.shipment_id;
  perform enqueue_webhook_event(new.org_id, 'document.uploaded',
    jsonb_build_object('shipment_ref', v_ref, 'document_type', new.document_type,
      'ref', new.ref, 'file_name', new.file_name));
  return new;
end;
$$;
drop trigger if exists shipment_documents_webhook on shipment_documents;
create trigger shipment_documents_webhook after insert on shipment_documents
  for each row when (new.source = 'uploaded')
  execute function capture_document_webhook();

-- deliver_pending_webhooks: the poller. Claims due rows with FOR UPDATE SKIP LOCKED (overlapping
-- cron runs are safe), POSTs each with an HMAC-SHA256 signature over the exact body, and books
-- the outcome per row inside its own exception block — one endpoint's failure never rolls back
-- another's bookkeeping. Backoff ladder 1m/5m/30m/2h; 'failed' after 5 attempts. Semantics are
-- at-least-once (an HTTP side effect can't be rolled back) — consumers dedupe on the
-- X-SST-Delivery-Id header. Returns the number of rows attempted (handy for manual runs).
create or replace function deliver_pending_webhooks()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
  v_body text;
  v_response http_response;
  v_count int := 0;
  v_new_attempts int;
begin
  -- 5s per-request cap: without it one hung endpoint stalls the whole run (the Week 9 call at
  -- register_carrier_tracking sets no timeout, but it handles one interactive request, not a
  -- batch). If this curlopt name is rejected by the installed pgsql-http version, the exception
  -- handler below simply proceeds with the extension's default timeout.
  begin
    perform http_set_curlopt('CURLOPT_TIMEOUT_MSEC', '5000');
  exception when others then
    null;
  end;

  for v_row in
    select d.id, d.event_type, d.payload, d.attempts, e.url, e.secret
    from webhook_deliveries d
    join webhook_endpoints e on e.id = d.endpoint_id
    where d.status = 'pending' and d.next_attempt_at <= now() and e.enabled
    order by d.created_at
    limit 20
    for update of d skip locked
  loop
    v_count := v_count + 1;
    v_body := v_row.payload::text;
    begin
      select * into v_response from http((
        'POST',
        v_row.url,
        array[
          http_header('X-SST-Event', v_row.event_type),
          http_header('X-SST-Delivery-Id', v_row.id::text),
          http_header('X-SST-Signature', 'sha256=' || encode(hmac(v_body, v_row.secret, 'sha256'), 'hex'))
        ],
        'application/json',
        v_body
      )::http_request);

      if v_response.status between 200 and 299 then
        update webhook_deliveries
          set status = 'delivered', delivered_at = now(), last_status_code = v_response.status, last_error = null
          where id = v_row.id;
      else
        v_new_attempts := v_row.attempts + 1;
        update webhook_deliveries
          set attempts = v_new_attempts,
              last_status_code = v_response.status,
              last_error = left(coalesce(v_response.content, ''), 500),
              status = case when v_new_attempts >= 5 then 'failed' else 'pending' end,
              next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[least(v_new_attempts, 4)]
          where id = v_row.id;
      end if;
    exception when others then
      v_new_attempts := v_row.attempts + 1;
      update webhook_deliveries
        set attempts = v_new_attempts,
            last_status_code = null,
            last_error = left(sqlerrm, 500),
            status = case when v_new_attempts >= 5 then 'failed' else 'pending' end,
            next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[least(v_new_attempts, 4)]
        where id = v_row.id;
    end;
  end loop;

  return v_count;
end;
$$;

-- list_webhook_deliveries: the only reader of the outbox (list_audit_log shape).
create or replace function list_webhook_deliveries(p_org_id uuid, p_endpoint_id uuid default null, p_limit int default 50)
returns table (id uuid, endpoint_id uuid, event_type text, status text, attempts int, last_status_code int, last_error text, next_attempt_at timestamptz, delivered_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_org_admin(p_org_id) or is_platform_admin()) then
    raise exception 'Only an Owner or Admin can view webhook deliveries';
  end if;

  return query
    select d.id, d.endpoint_id, d.event_type, d.status, d.attempts, d.last_status_code,
           d.last_error, d.next_attempt_at, d.delivered_at, d.created_at
    from webhook_deliveries d
    where d.org_id = p_org_id
      and (p_endpoint_id is null or d.endpoint_id = p_endpoint_id)
    order by d.created_at desc
    limit least(coalesce(p_limit, 50), 200);
end;
$$;

-- send_test_webhook: enqueues a test.ping for one endpoint (bypasses the event_types filter —
-- a test should always arrive), delivered by the same poller/signature path as real events.
create or replace function send_test_webhook(p_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint webhook_endpoints;
begin
  select * into v_endpoint from webhook_endpoints where id = p_endpoint_id;
  if v_endpoint.id is null then
    raise exception 'Webhook endpoint not found';
  end if;
  if not is_org_admin(v_endpoint.org_id) then
    raise exception 'Only an Owner or Admin can send a test webhook';
  end if;

  insert into webhook_deliveries (org_id, endpoint_id, event_type, payload)
  values (v_endpoint.org_id, v_endpoint.id, 'test.ping',
    jsonb_build_object('version', '1', 'event_type', 'test.ping', 'occurred_at', now(),
      'data', jsonb_build_object('message', 'SST Freight webhook test')));
end;
$$;

-- pg_cron schedule: cron.schedule() upserts by job name (idempotent re-runs, consistent with
-- this file's re-runnable contract). Requires the pg_cron extension to be enabled first — see
-- the section banner above.
create extension if not exists pg_cron;
select cron.schedule('deliver-webhooks', '* * * * *', $$select deliver_pending_webhooks()$$);

-- Grants & revokes for this section.
revoke execute on function enqueue_webhook_event(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function deliver_pending_webhooks() from public, anon, authenticated;
grant execute on function list_webhook_deliveries(uuid, uuid, int) to authenticated;
grant execute on function send_test_webhook(uuid) to authenticated;

-- ============================================================================================
-- Week 19 (ADR-0030) — Business-logic tier pilot: convert_quote_to_shipment.
-- The quotes-service Edge Function orchestrates quote workflows; THIS function is the one
-- "atomic multi-step database operation" of that pattern — shipment creation and the quote's
-- status flip happen in ONE transaction behind a row lock, which finally and fully closes the
-- quote-conversion double-submit race left open by ADR-0006 ("accepted risk") and only
-- narrowed by ADR-0022 (visible rejection, but the orphan shipment insert still happened).
-- Two concurrent conversions now serialize on FOR UPDATE: exactly one shipment is ever
-- created; the loser gets a clean 'Quote is already converted' error and zero rows written.
-- ============================================================================================

create or replace function convert_quote_to_shipment(p_quote_id uuid)
returns shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote quotes;
  v_shipment shipments;
  v_prefix text;
  v_attempt int;
begin
  -- The row lock IS the race fix: a concurrent second call blocks here until the first
  -- transaction commits, then reads the already-converted row and raises below.
  select * into v_quote from quotes where id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'Quote not found';
  end if;
  if not is_org_member(v_quote.org_id) then
    raise exception 'Not authorized to convert this quote';
  end if;
  if v_quote.status = 'converted' or v_quote.converted_shipment_id is not null then
    raise exception 'Quote is already converted';
  end if;
  if v_quote.status = 'rejected' then
    raise exception 'Invalid quote status transition: rejected -> converted';
  end if;

  -- Same ref shape and retry-on-collision behavior the client previously implemented
  -- (src/lib/refGenerator.ts + api/shipments.ts), now server-side and transactional.
  v_prefix := case v_quote.mode when 'ocean' then 'BKG' when 'air' then 'AWB' else 'TRK' end;
  for v_attempt in 1..5 loop
    begin
      insert into shipments (org_id, ref, mode, client, origin, destination, status,
                             shipper_contact_id, consignee_contact_id, created_by)
      values (v_quote.org_id,
              v_prefix || '-' || extract(year from now())::int || '-' || (100 + floor(random() * 899))::int,
              v_quote.mode, v_quote.consignee_name, v_quote.origin, v_quote.destination,
              'Booked', v_quote.shipper_contact_id, v_quote.consignee_contact_id, auth.uid())
      returning * into v_shipment;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  -- Runs through validate_quote_status_transition (draft/sent/accepted -> converted are all
  -- allowed pairs) and the quotes_audit trigger, exactly like the old client-side update did.
  update quotes set status = 'converted', converted_shipment_id = v_shipment.id
    where id = p_quote_id;

  return v_shipment;
end;
$$;

grant execute on function convert_quote_to_shipment(uuid) to authenticated;
