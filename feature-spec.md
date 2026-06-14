# Product Spec: DomicileDB

> A self-hosted home inventory built for the moment that actually matters: proving what you
> owned, and getting paid for it, after a fire, flood, or theft.

---

## 1. Overview & Goal

### The problem

Most people have no usable record of what they own. When disaster strikes — fire, flood,
burglary — the insurance company asks them to _list everything they owned and prove it_, from
memory, while standing in a hotel room. People under-claim by thousands of dollars simply
because they can't remember or can't prove ownership.

DomicileDB exists to make that record easy to build, easy to keep current, and impossible to
lose with the house — so that when the worst day comes, the user can hand an adjuster a
credible, complete, photo-and-receipt-backed inventory and get fully reimbursed.

Secondarily, the same record is useful every day: looking up a model/serial number, tracking
warranties, and knowing what you own and what it's worth.

### The guiding lens (the "moment of truth")

Every feature is judged against one question:
**Does this help the user win the claim conversation and get paid?**

A beautiful catalog that the adjuster won't accept — or that burned up with the house — has
failed the only test that counts.

### Target user

A single homeowner managing the inventory of their own household. Technically comfortable
enough to self-host. One person owns and edits the data; sharing happens by handing someone a
report, not by giving them an account.

---

## 2. Personas & Primary Jobs

**Primary persona — "The Owner."** Wants a complete, current inventory but has very little
patience for data entry. Will capture in short bursts (a few items at a time, often on their
phone while walking a room) and expects to finish details later.

### Jobs to be done

1. **Capture fast, now.** "I'm holding the item / standing in the room — let me get it into the
   system in seconds and move on."
2. **Finish the details later.** "Come back to half-finished items and complete them, with the
   app doing as much of the work as possible."
3. **Prove it and get paid.** "Disaster happened — produce a credible, complete proof packet I
   can give my insurer."
4. **Keep it current & trustworthy.** "Reflect what I actually own today — things I've sold,
   broken, replaced, or whose value has changed."

---

## 3. Core Principles

These are the non-negotiable product commitments. Features that violate them are wrong by
definition.

1. **Mobile-first capture.** The primary act — photographing and adding items — happens on a
   phone, walking through the house. Review and reporting can be richer on a larger screen, but
   capture must be effortless on mobile.
2. **The data survives the event.** If the house is destroyed, the inventory must not be.
   Self-hosted, but with off-site backup and export as first-class, non-optional capabilities.
3. **AI assists, the human confirms.** AI speeds up data entry, but the user always reviews and
   confirms before AI-derived data (especially serial/model numbers and values) is saved. A
   wrong serial number on a claim is worse than a blank one.
4. **Privacy by consent.** This is a list of everything valuable a person owns and where it is.
   AI processing is remote (OpenRouter), so it must be **opt-in per action**, the user must see
   what is being sent, and nothing is ever auto-uploaded silently.
5. **Trustworthy means current.** An out-of-date inventory loses claims. The product actively
   helps the inventory stay accurate (lifecycle status, re-valuation reminders), rather than
   silently rotting.
6. **Low-friction first, completeness second.** It is always acceptable to have a half-finished
   item. The product is designed around progressive enrichment, not all-or-nothing entry.
7. **Operator config vs. user settings are separate.** Because this is a single-user, self-hosted
   app, operational knobs — backup target/frequency, reminder cadence, AI provider credentials —
   are set by the **operator at deploy/runtime** and are not surfaced as end-user preferences. The
   end user manages _their inventory_, not the system's plumbing.

---

## 4. Key User Flows

### 4.1 Quick capture (mobile)

The user opens the app, takes one or more photos of an item, and saves it with almost no
typing. The item is created in a **Draft / Needs detail** state. The whole interaction should
take seconds. Optionally, the user can speak or type a one-line title.

### 4.2 AI-assisted detail completion

For a draft item, the user can opt in to AI assistance:

- **Identify** likely manufacturer, model, and category from the photo.
- **Read the serial/model plate** (OCR) from a close-up photo.
- **Draft a description.**
- **Suggest a current replacement cost.**

Before sending, the user sees exactly what will be sent to the remote AI and consents. AI
results are presented as **suggestions to confirm or edit**, never silently committed.

### 4.3 The "needs detail" worklist

A dedicated view lists every incomplete/draft item so the user can methodically finish them —
turning scattered quick-captures into a complete record. The product nudges the user toward a
"complete" inventory rather than leaving drafts to languish.

**"Complete" is user-determined.** There is no fixed set of required fields — what counts as
"done enough" varies by item (a TV needs a serial number; a couch may not). The user explicitly
marks an item as **complete**, which removes it from the worklist. The product may _suggest_
likely-missing fields, but the user makes the call.

### 4.4 Keep current (lifecycle & re-valuation)

- The user can mark items **sold / disposed / gifted / broken / replaced**, so the inventory
  reflects reality.
- The product tracks when each value was last set and **reminds** the user to re-review aging or
  high-value items, so the inventory doesn't silently go stale. The reminder cadence is **global**
  and defaults to **quarterly**. It is set by the **operator at deploy/runtime** (configuration),
  not exposed as an end-user setting.

### 4.5 Generate the proof packet

On demand, the user produces a **claim-ready proof packet** (see §8) covering the whole
household or a selected room/category, and downloads it to hand to an insurer.

### 4.6 Onboarding / empty state

A first-time user is guided to set up their household and rooms, then pointed straight at quick
capture. The empty state teaches the core loop (snap → save draft → enrich later) rather than
demanding a complete item up front.

---

## 5. Entities (conceptual data model)

> Described at the product level — the _information the user cares about_, not database tables.

### Household / Property

The top-level container. Holds a general description, location, and address. **v1 supports one
household;** multiple properties (vacation home, rental) are a future consideration.

### Location

Where an item lives. Most locations are **rooms**, but the model must also handle things that
aren't rooms: **garage, shed, storage unit, vehicle, safe deposit box, on loan to someone.**
An item belongs to one location at a time and can be moved.

### Item / Asset

The core record. Captures:

- Title, description, category
- Manufacturer, model number, serial number
- **Quantity & sets** — e.g. "8 dining chairs" logged as a single entry with a quantity and a
  **per-item value**; reports show the aggregate (quantity × per-item value). v1 keeps this
  simple: grouped items do **not** track per-unit serial numbers — they're for things where
  individual identity doesn't matter.
- **Lifecycle status** — active / sold / disposed / gifted / broken / replaced, with the
  relevant date
- Condition and approximate age
- One or more **Photos** (including condition shots and serial-plate close-ups)
- Links to **Valuations** and **Documents**

### Valuation

Because "what it's worth" is not one number and changes over time:

- **Price paid** + date purchased (proof of original cost)
- **Replacement cost** (what it costs to buy new today) — user-entered and/or AI-suggested,
  then confirmed
- **Actual cash value** consideration (replacement cost adjusted for age/condition)
- **Last-valued date** — so staleness is visible and remindable

### Document

First-class proof, not an afterthought:

- **Receipts / proof of purchase**
- **Warranties** (with expiration → reminders)
- **Manuals**

### Category & Tags

Items are organized by **room/location**, but _also_ by **category** (electronics, jewelry,
furniture, appliances, firearms, art, etc.) and free-form **tags**. Categories matter because
insurance policies think in categories (see §7).

### Policy / Coverage

The user's insurance coverage, entered once and updated rarely. **Grounded in what a real
declarations page actually contains** (validated against a live HO-3 dec page): the headline
coverage limits are present and clean, but per-category special sub-limits are _not_ on the dec
page — they live in the policy form.

For v1, this entity captures the **overall Coverage B – Personal Property limit** (e.g.
$456,750) — the single cap on the user's total belongings. The other headline coverages
(Dwelling, Loss of Use) may be stored for reference, but Coverage B is the one that drives the
v1 computation in §7. Per-category sub-limits, scheduled-item riders, and deductible math are
deferred (see §10) because they can't be sourced reliably from the dec page alone.

---

## 6. AI Assist

### Capabilities

- Identify manufacturer / model / category from a photo.
- OCR serial and model numbers from a plate close-up.
- Draft item descriptions.
- Suggest current replacement cost.
- **Parse an insurance declarations page** — the user can upload their dec page and AI extracts
  the **headline coverage limits (notably Coverage B – Personal Property)** to pre-fill the
  Policy/Coverage setup (user confirms). Note: per-category special sub-limits are _not_ on the
  dec page, so AI cannot extract them — only the overall coverages, deductible, and listed
  endorsements. Manual entry remains available.
- (Stretch) Voice-to-item quick capture.

### Provider

AI runs remotely via **OpenRouter** — i.e. data leaves the user's infrastructure for analysis.

### The trust model (required, not optional)

- **Opt-in per action.** No automatic uploads. The user chooses when to invoke AI.
- **Transparency.** Before sending, the user sees what will be transmitted (which photo, which
  fields).
- **Confirm step.** Every AI output is a _suggestion_; the user reviews and accepts/edits before
  it is saved. This is especially strict for serial numbers, model numbers, and dollar values.

---

## 7. Insurance / Valuation Model (insurance-grade)

This is the spine of the product. The goal is an inventory an adjuster will accept — and, just
as importantly, to warn the user about coverage gaps **while there's still time to fix them.**

### Value tracking

- **Multiple value types per item:** price paid, current replacement cost, and an ACV view
  (replacement cost adjusted for age/condition). Reports can total by whichever the policy uses.
- **Proof of ownership** attached to items (receipts, in-situ photos, serials).
- **Freshness.** Each value carries a last-valued date; the product reminds the user to
  re-review aging and high-value items so figures stay defensible.

### Overall coverage tracking (the v1 core insurance value)

The most valuable thing the product can tell a user is also the simplest to compute, and the
number it needs is right on the dec page: **is your stuff worth more than your policy will pay
for it?**

The product compares the **total replacement-cost value of the active inventory** against the
**Coverage B – Personal Property limit** and surfaces the result. **Replacement cost is the basis
for this comparison** — it's what a contents limit is meant to cover, and it's the most
conservative (highest) of the tracked values, so the user is warned _early_ rather than lulled by
a lower depreciated total.

> _"You've inventoried **$310,000** of belongings against a **$456,750** personal-property limit
> — you're within coverage (68%)."_
>
> _"You've now inventoried **$478,000** against a **$456,750** limit — **you appear underinsured
> by ~$21,000.** Consider reviewing your coverage with your insurer."_

Behavior:

- A simple **coverage status** (within coverage / approaching limit / over limit) with the
  running total and percentage used.
- A nudge when the inventory reaches **80% of the Coverage B limit** ("approaching limit"), and a
  clear warning when it **exceeds 100%**. The 80% trigger is a global default set by the operator
  (per §3), not an end-user setting.
- Reflects only **active** items (sold/disposed items don't count toward the total).
- Items missing a replacement-cost value are surfaced as **excluded from the total**, so the
  coverage picture is honestly "at least $X" rather than silently undercounting.

This is honest, immediately useful, and grounded entirely in what the dec page reliably provides.

**Where it lives.** Coverage status is **ambient, not a destination.** A compact, glanceable
summary sits on the **home/dashboard** (running total, % used, and a green/amber/red indicator) —
always visible but never demanding action. On top of that, **contextual alerts escalate with
risk**: a gentle nudge at 80%, a clear warning over 100%, surfaced where the user already is
(e.g. right after adding the item that crossed the threshold). It earns attention in proportion
to the actual exposure rather than occupying primary navigation.

### Framing & liability

Coverage output is **informational, not advice.** The product consistently tells the user to
**verify with their insurer** and never represents itself as a determination of what is or isn't
covered. It is a prompt to _go check_, not a coverage determination.

> **Why overall-only for v1:** Validating against a real dec page showed that the overall
> Coverage B limit is present and clean, while per-category special sub-limits (jewelry,
> firearms, money, silverware), scheduled-item riders, and deductible math are _not_ on the dec
> page and require interpreting the policy form. Those are deferred to a later tier (see §10) so
> v1 stays grounded in reliable data.

---

## 8. Reporting — the Claim-Ready Proof Packet

The headline output. A downloadable document the user can hand to an insurer that stands up as
proof.

Contents:

- Organized **by room/location**, with a household summary.
- Per item: photos, receipts, manufacturer/model/serial, purchase and replacement values,
  condition/age, and acquisition date.
- **Totals** — overall, by room, and **by category**.
- **Coverage status** — the total inventory value shown against the Coverage B limit, so the
  user (and adjuster) can see at a glance whether the inventory is within or over coverage.
- Generated for the whole household or a filtered subset (a single room, a single category).

Format priority for v1: a polished, print-ready **PDF proof packet**. (A structured data export
is a possible later addition but is not the v1 priority.)

---

## 9. Data Resilience & Privacy

- **Self-hosted** — the user runs and controls the application and its data.
- **Off-site backup is mandatory, not optional** — the inventory must survive destruction of the
  home. Backup is **S3-based** and syncs three things:
  1. **Item images** (and document attachments),
  2. The **local database**, which can be used to fully **restore** the system, and
  3. A current version of the **PDF proof-packet export**, so even with no running app the user
     still has a usable, human-readable inventory off-site.
     Backup and restore must be obvious and reliable. The S3 target and **backup frequency** are
     configured by the **operator at deploy/runtime**, not exposed as end-user settings.
- **Export** — the user can get their complete inventory (data + photos + documents) out of the
  system, both for resilience and to avoid lock-in.
- **Privacy** — single owner; sharing is via exported reports, not accounts. Remote AI use is
  governed by the consent model in §6.

---

## 10. Out of Scope (for v1) / Future Considerations

- **Per-category sub-limit tracking** — the jewelry/firearms/money/silverware special limits.
  Deferred because they aren't on the dec page: would require a **policy-form template** of
  standard sub-limits (with **per-article _and_ aggregate** caps, e.g. Option JF's "$1,500 each /
  $2,500 aggregate"), overridable per endorsement.
- **Scheduled-item tracking** — marking items individually scheduled on a rider (scheduled value
  - appraisal), which sit outside the category sub-limits.
- **Deductible-aware math** — reflect estimated payout net of the deductible.
- **Limited Replacement Cost support** — many contents settlements (this policy: "B1 Limited
  Replacement Cost") pay ACV up front and the rest only after the item is replaced and a receipt
  is submitted; future work could help track that two-step recovery.
- **Fuller policy model** — ACV vs. RCV math, renewal-date reminders, multiple policies.
- Multi-user / household accounts (spouse co-editing).
- Multiple properties at scale (portfolio of homes/rentals).
- Emergency read-only access for trusted family.
- Automated, continuous market re-pricing of items.
- Structured data export / spreadsheet output alongside the PDF.
- Direct integration with insurers' claim systems.
- Multi-currency.

---

## 11. Resolved Decisions

- **Item completeness is user-determined.** No fixed required fields; the user marks an item
  complete to clear it from the worklist (§4.3).
- **Re-valuation reminders are global, default quarterly, set by the operator at deploy/runtime**
  — not an end-user setting (§4.4, §3).
- **Sets/quantities use a single per-item value with an aggregate view; no per-unit serials in
  v1** (§5).
- **Backup is S3-based**, syncing images/attachments, the restorable local database, and a
  current PDF proof-packet export; target and frequency are **operator-configured at
  deploy/runtime**, not an end-user setting (§9, §3).
- **Coverage tracking is computed from the real policy, not guessed** — and validated against an
  actual HO-3 dec page. **v1 = overall Coverage B tracking only** (total inventory vs.
  personal-property limit). Category sub-limits, scheduled items, and deductible math are deferred
  (§7, §10).
- **AI parses the declarations page to pre-fill the headline coverage limits** (notably Coverage
  B), as an option; it cannot extract sub-limits because they aren't on the dec page (§6).
- **The Coverage B comparison uses replacement-cost value** (the conservative, intended basis),
  not price paid or ACV (§7).
- **The "approaching limit" nudge fires at 80% of Coverage B** (global operator default);
  warning over 100% (§7).
- **Coverage status is ambient, not a destination** — a glanceable home/dashboard summary plus
  contextual alerts that escalate at 80% / 100% (§7).

## 12. Remaining Open Questions

_(None outstanding for the product spec at this stage. Next phase is UX/flow design — see below.)_
