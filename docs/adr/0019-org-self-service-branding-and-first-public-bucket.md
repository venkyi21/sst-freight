# 0019. Org self-service branding gets its own owner/admin-gated RPC; org-logos is the first public Storage bucket

**Status:** Accepted

## Context

Following the post-Week-12 "enterprise close" backlog review, the user chose white-label
branding (logo + brand color) as the next work item — buildable immediately with no external
dependency, unlike carrier-tracking read access (needs a paid Terminal49 upgrade, declined for
now) or e-signature (needs real DocuSign/SignWell credentials the user is still setting up).
Per-org custom domain was explicitly split out of this item as a separate, larger conversation —
this app remains a single static GitHub Pages site with no per-tenant routing layer, and a real
custom domain per org is a hosting/DNS decision, not a code change.

Exploration found `organizations.color` already existed but was only ever set **randomly** at
creation (`OrgPicker.tsx` picks from `TENANT_COLORS` at random, never lets a user choose), no
`logo_url` column existed at all, and — most importantly — **no UPDATE path on `organizations`
exists for anyone but a platform admin**: `set_org_billing_model`/`set_org_config` (Week 8,
ADR-0012) are both gated to `is_platform_admin()` only. Self-service editing of an org's own
identity fields by its own Owner/Admin needed a genuinely new authorization path.

## Decision

**New RPC `update_org_branding(p_org_id, p_color, p_logo_url)`, gated by `is_org_admin()`** — the
same function `update_member_role`/`remove_member` already use — not `is_platform_admin()`. This
is deliberately a `SECURITY DEFINER` RPC rather than a plain grant: unlike `tariffs`/
`customs_filings` (any org member may write), branding is restricted to that org's own Owner/Admin,
which is exactly the case ADR-0002 reserves for an RPC over a plain grant. Server-side hex-color
validation was added here (`^#[0-9a-fA-F]{6}$`) since `create_organization` never validated
`p_color` at all — worth tightening on this new path, not retrofitted onto the old one.

**`org-logos` is the first *public* Storage bucket in this app**, deliberately contrasted with
Week 11's private `shipment-documents` bucket. A company logo is not confidential the way a
shipment's Certificate of Origin or invoice is — it's meant to be displayed everywhere the org's
identity shows up (sidebar, org switcher), on every page load, for every member. A public bucket +
`getPublicUrl()` avoids the signed-URL expiry/re-fetch complexity Week 11 needed for genuinely
private files, which would be pure overhead for something that just needs to sit in an `<img src>`.

**Path convention is `{org_id}/logo`** (fixed, no uuid) — deliberately different from Week 11's
uuid-per-upload, immutable-log convention. A logo is *current state*, not a log entry: uploading a
new one calls `.upload(path, file, { upsert: true })` and genuinely overwrites the old one. There
is no "logo history" concept, matching how the org only ever has one current logo.

## Alternatives Considered

- **Extend `set_org_config`/`set_org_billing_model` to also accept branding fields.** Rejected:
  those are deliberately platform-admin-only (any org, by staff) — conflating that with
  self-service (own org, by its own admin) would blur two genuinely different privilege scopes
  that happen to touch the same table.
- **Keep `org-logos` private with signed URLs, matching `shipment-documents` for consistency.**
  Rejected: consistency for its own sake isn't a good reason to add expiry/re-signing complexity
  to data that was never sensitive in the first place — the two buckets have genuinely different
  sensitivity profiles, and the schema should say so plainly rather than pretend otherwise.
- **Scope per-org custom domain into this same pass** (since it was named alongside logo/color in
  the original backlog item). Rejected per direct discussion with the user: this app's
  single-static-site-on-GitHub-Pages hosting model has no per-tenant routing layer today; a real
  custom domain is a hosting/DNS architecture decision needing its own scoping conversation, not
  an extension of a "3-day" branding task.

## Consequences

- **Any future self-service (org's-own-admin-editable) field on `organizations` should extend
  `update_org_branding` or follow its exact `is_org_admin()`-gated RPC shape** — not
  `set_org_config`'s platform-admin shape, and not a plain grant (this table's `select` policy
  already allows `is_platform_admin()` to see any org, so a plain update grant would need
  significant extra `with check` logic to replicate what the RPC does trivially).
- **Any future Storage bucket needs an explicit sensitivity call**: public (like `org-logos`) or
  private-with-signed-URLs (like `shipment-documents`) — this is now a real, named decision point
  for the next bucket, not something to default on autopilot.
- **Per-org custom domain remains explicitly unscoped** — if it's picked up later, it needs its
  own ADR addressing the hosting/DNS/TLS architecture question, which this ADR deliberately does
  not answer.
