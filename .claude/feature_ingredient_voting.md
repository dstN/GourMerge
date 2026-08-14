# Ingredient Community-Verification — decision record

**Status: parked in the backlog, not scheduled.** This document exists so the trade-offs
don't have to be rediscovered next time this is picked up. See `.claude/ROADMAP.md`'s
Post-v1 backlog item 0 for the original framing.

## The problem

User-created ingredients enter the shared, global catalog immediately
(`ingredients.created_by`), usable in the author's own recipes right away and visible to
everyone else's autocomplete/explore/aggregates from the moment they're saved. Two
independent failure modes: catalog pollution (typos, duplicates, joke entries) and
plausible-but-wrong nutrition data — worse, because it's invisible and silently propagates
into every recipe that uses the ingredient.

Confirmed while researching this: **no pending/confirmed/status column exists today** on
either `ingredients` or `ingredient_nutrition` — the only trust signals are `created_by`
(NULL vs. set) and `ingredient_nutrition.source`. Either design below is new ground, not
an extension of an existing gate.

## Option A — cheap slice: admin promotion (recommended first step)

A user-created ingredient stays private to its author's own recipes until an admin
promotes it into the public catalog (search/explore/others' autocomplete). No voting, no
threshold question.

- Reuses the existing `/admin/reports`-style queue pattern almost exactly: a new admin
  list view, one action button per row ("promote"), `requireAdmin()` gate (already
  fresh-checks `is_admin` from the DB every request, never trusts the session).
- Schema: one `status` enum column (`pending` / `approved`), default `pending` for
  anything with a non-null `created_by`; NULL/`created_by IS NULL` rows (the Swiss BLV
  import) are implicitly approved.
- Nutrition can piggyback on the same status, or be gated independently later — not
  required for v1 of this slice.
- Stops pollution immediately. Ongoing cost: an admin has to actually look at the queue.

## Option B — full peer-voting

Other users confirm an ingredient; at `x` confirmations it's promoted automatically.
Nutrition values are confirmed independently of the ingredient's existence (an ingredient
can be "real" while its kcal figure is still unconfirmed).

Needs, before any code: **who may vote** (a raw "any signed-in user" is brigadeable —
weighting by account age or ≥1 published recipe is the usual answer and a reasonable
default to start from) and **what `x` is** (too low defeats the point; too high means
nothing is ever promoted — 3, with the `≥1 published recipe` gate on voters, is a
reasonable starting guess, not a researched number).

- Schema: an `ingredient_confirmations` table, one row per (user, ingredient), unique
  index — same shape as `recipe_stars`. A denormalized `confirmationCount` column,
  incremented in the same transaction as the vote insert (same pattern as `starCount`),
  reconciled by `scripts/reconcile-counters.mjs`. A separate confirmation table/counter for
  nutrition if that's gated independently.
- Meaningfully more surface area than Option A: a new table, a new counter, a voting UI,
  gaming resistance to think through (sock-puppet accounts, retaliatory
  downvoting-by-omission), and two open product questions that block writing any code at
  all.

## Recommendation

Build Option A first if/when this is picked up. It solves the actual, currently-live
pollution problem today with a small, well-precedented change, and doesn't foreclose
Option B later — a `status` column and a `confirmations` table aren't in tension with
each other; Option B could be layered on top of Option A's schema rather than replacing
it.
