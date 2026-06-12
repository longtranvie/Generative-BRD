# Customer Onboarding Portal — Discovery Notes

_Internal working document. Compiled from interviews with Customer Success
(Maria, Devon), Product (Priya), Engineering (Aaron), and three customer
champions in March 2026. Not a spec — raw notes the BRD should be built from._

## Background

ACME Cloud sells a B2B analytics platform. We close ~120 new customer
contracts per quarter. Today the onboarding experience after contract signature
is essentially "your CSM will reach out to schedule a kickoff." Median
time-from-signature to first dashboard rendered (TTFD) is **27 days**.
About 18% of new customers never reach TTFD within 60 days; most of those
churn at renewal.

Maria from CS estimates her team spends roughly **60% of their week** on
onboarding mechanics — scheduling kickoffs, walking customers through the
admin console, manually provisioning sandbox data, chasing IT contacts for
SSO setup. The CFO has flagged CSM headcount growth as the second-largest
expansion item in the 2026 plan; reducing per-customer onboarding hours is
a stated cost-containment goal.

## What we want to build

A self-serve onboarding portal that a newly-signed customer's admin can log
into immediately after contract signature, without waiting for a CSM
kickoff. The portal walks them through the minimum work needed to render
their first useful dashboard.

Devon's framing: "If the portal can get a motivated customer from signature
to first dashboard in under 3 days without a human on our side, we've
fundamentally changed the unit economics of CS."

The portal is **not** a replacement for the CSM relationship. CSMs still
own strategic check-ins, expansion conversations, and complex integration
work. The portal handles the mechanical first-mile.

## Goals we'd hold ourselves to

- Cut median TTFD from 27 days to under 7 days.
- Lift the 60-day activation rate (any dashboard rendered) from 82% to >95%.
- Reduce CSM hours-per-onboarding by at least 50%, freeing capacity without
  adding headcount through end of 2026.
- Maintain or improve customer-reported onboarding NPS (currently +24).

These are the numbers the executive review will judge this against. Anything
the portal does that doesn't move one of these four numbers is out of scope
for v1.

## What's in

- **Account setup wizard.** Step-by-step: invite teammates, set company
  metadata, pick industry vertical (which seeds dashboard templates).
- **SSO configuration self-serve.** Today this requires a screen-share with
  Aaron's team. v1 needs to support Okta and Azure AD via SCIM, with a
  documented "test connection" step and inline error messages that
  reference the specific SSO config field at fault. Auth0 and Google
  Workspace deferred to v1.1.
- **Sample data import.** Either upload a CSV the customer brings, OR
  generate synthetic data from one of three industry templates (SaaS,
  retail, fintech). Synthetic data must look realistic enough to demo to
  the customer's exec sponsor.
- **First-dashboard wizard.** Pre-built dashboard templates keyed to the
  industry vertical chosen above; user picks one and the system renders it
  against the imported data with one click.
- **Progress tracker.** Visible to the customer admin AND to the assigned
  CSM, showing which steps are complete, which are blocked, and where the
  customer is stuck (e.g. "SSO test failing for 2 days").
- **CSM handoff trigger.** Any step the customer marks as "I need help with
  this" or that fails twice creates a notification to the assigned CSM
  with full context. CSM intervenes only on flagged steps.

## What's out (for v1)

- Custom integrations beyond SSO. Salesforce / HubSpot / Snowflake connectors
  exist in the main product; teaching them to brand-new admins is a v1.1
  problem.
- Billing / invoicing changes. The portal does not touch the billing
  system. Plan changes still go through Sales.
- White-labeling. Some enterprise prospects have asked for portal
  white-labeling. Defer to 2027.
- Multi-region data residency configuration. All v1 onboardings land in
  us-east-1; EU customers go through the existing manual flow until v1.2.

## Who's involved

- **Customer admin** — primary user. Usually a technical IT lead, but not
  always; the portal must not assume engineering skill. They'll log in,
  do the work, and exit. They are the only role with portal-side write
  access in v1.
- **Customer end-users** — invited by the admin via the teammates step.
  They don't see the portal itself; they land directly in the product.
- **CSM (us)** — owns the assigned account, watches the progress tracker,
  responds to flagged steps. Cannot complete steps on the customer's
  behalf (legal/audit constraint).
- **Sales (us)** — kicks off the portal when the contract is signed. No
  ongoing role.
- **Aaron's engineering team** — owns SSO integration code; required as a
  reviewer on any change to the SSO self-serve flow.
- **Priya (Product)** — final approval authority on what ships in v1.
- **Security review** — required before any external launch given that the
  portal touches auth configuration.

## Constraints we already know about

- **SOC 2 Type II.** ACME Cloud is mid-cycle; any new authentication
  surface must be in scope of the existing audit. Security has said this
  means structured audit logs for every admin action, retained 365 days,
  and SSO config changes must require step-up auth (email re-verification).
- **No PII handling.** The portal must not store customer PII beyond what
  the main product already stores. If we collect anything new it goes through
  a privacy review.
- **Latency budget.** Every interactive step must respond within 2 seconds
  p95 from US-East and Europe. Dashboard render itself can take longer,
  but the "click render" interaction must acknowledge in under 2s.
- **Mobile.** Customer admins increasingly do setup work from phones.
  v1 must be fully usable on iOS Safari and Chrome on Android. Native
  apps not in scope.
- **Browser support.** Last two versions of Chrome, Safari, Firefox, Edge.
  No IE.
- **Accessibility.** WCAG 2.1 AA. Customer procurement teams have started
  including this in contracts.

## Assumptions

- Sales will reliably trigger the portal at signature. We are not building
  a fallback for "customer signed but portal was never provisioned" — that
  is a process bug Sales owns.
- Salesforce remains the source of truth for which CSM owns which account;
  the portal reads CSM ownership from Salesforce on first login.
- Customers we sell to have at least one admin willing to do hands-on
  setup. We are not solving for customers who want everything done for
  them — those are a different segment that stays on the CSM-led path.
- The synthetic data templates are realistic enough for v1; we'll iterate
  based on customer feedback rather than over-engineer up front.

## Risks Priya called out explicitly

- SSO self-serve is the highest-risk step. If we get it wrong, customers
  hit a wall on day 1 and CSM hours go UP not down. Aaron wants a beta
  with 5 friendly customers before general availability.
- The "synthetic data looks fake" risk. If a customer demos a dashboard
  full of obviously-fake data to their CEO and looks bad, we've lost
  the account. CS has veto authority on the synthetic data quality bar.
- Scope creep on the dashboard wizard. There are 40+ dashboard templates
  in the product; v1 should ship with no more than 6, chosen to cover the
  three industry verticals deeply rather than thinly across all 40.

## How we'll know it worked

- **TTFD median ≤ 7 days** measured over a rolling 90-day window once
  >50 customers have run through the portal.
- **60-day activation rate ≥ 95%.**
- **CSM hours per onboarding** measured via Maria's time-tracking ≤ 50%
  of current baseline.
- **Onboarding NPS** held flat or improved (no regression below +20).
- **Zero SOC 2 audit findings** related to the portal.
- **SSO setup success rate ≥ 90%** on first try, measured weekly.

If after one quarter post-launch any of TTFD, activation, or CSM-hours has
not moved meaningfully toward target, Priya wants the team to pause feature
work on v1.1 and diagnose.

## Open questions (not blocking BRD draft)

- Does the portal need an in-product chat for "ask my CSM a question"
  or does email/Slack handoff suffice for v1?
- Multi-admin: do we let the inviting admin transfer ownership to a
  different admin partway through onboarding?
- What's the timeout policy for an abandoned onboarding — do we ping
  the customer, the CSM, both?

These can be resolved during BRD review.
