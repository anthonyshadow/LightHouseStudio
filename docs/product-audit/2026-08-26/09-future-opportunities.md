# Future opportunities

Ideas that are genuinely good and should **not** be built yet. Each carries the reason, and what
would have to be true first.

The general principle: the product has not yet finished delivering one correct video to one
operator. Anything that widens the surface before that loop closes makes the gap harder to see and
harder to fix.

---

## Deferred until the export artifact is real

### Direct publishing to channels

Post to TikTok, Reels, Shorts, or a scheduling tool.

**Why not yet** The product already names these destinations in its placement copy and cannot
produce a file in the right shape for any of them ([F-01](08-prioritized-findings.md)). Publishing
the wrong shape automatically is worse than not publishing. It also introduces OAuth, tokens, rate
limits and a whole class of failure the product has no model for.

**First** F-01, then F-24 shows real demand.

### Several placements from one cut

Save once, receive phone, square and wide.

**Why not yet** This is the most valuable thing on this page and the closest to reachable — but it
is a straight multiplication of F-01. Building it against download-time rendering would mean
rendering the same video three times in the browser at download.

**First** F-01. Then this is **M**, not L.

### A shareable link to a finished video

A read-only URL for a client or colleague.

**Why not yet** The product is loopback-only by deliberate design; a shareable link is not a feature
but a change of deployment posture, already correctly deferred by
[`deferred-account-and-infrastructure-roadmap.md`](../../deferred-account-and-infrastructure-roadmap.md).

---

## Deferred because the foundation is not asking for them

### Multi-user accounts, roles and collaboration

**Why not yet** One operator, one machine, no signup. Every ownership boundary already derives from
the verified session subject, so the groundwork is sound — but adding people to a workflow that has
not settled its own vocabulary and deliverable would multiply the surface of every unfinished
decision.

### Billing, credits and metering

**Why not yet** Worth distinguishing from **F-11**, which is _not_ deferred. Showing the operator
what their AI work has cost is P2 and should be built. _Charging_ for it needs a customer, a price
and an account system, none of which exist.

**First** F-11 makes consumption visible. Billing needs a business model.

### A multi-clip timeline editor

**Why not yet** The product is single-source by construction: a Project has one original video and a
current cut. A timeline implies several sources, transitions and audio beds — a different product
with a different data model. The existing single-source editor is a genuine differentiator; widening
it would dilute it.

### Brand kits, templates and presets

**Why not yet** Premature while a Campaign carries nothing (**F-09**). Target placements on a
Campaign are the _first_ form of a template, and the right one to build first because they are
concrete and already half-modelled. Colours, fonts and lower-thirds imply a compositing layer the
product does not have.

**First** F-09.

### Stock media, music or captions

**Why not yet** Each is a licensing surface and a provider relationship. Captions in particular
would be valuable for social output, but they need a transcript pipeline and a burn-in step, and the
burn-in step needs the render to happen server-side. Same prerequisite as everything else.

---

## Deferred engineering

### Restructuring the dual Project repository

**Why not yet** 6,385 lines of parallel implementation is the largest maintenance liability in the
codebase (**F-16**), and the instinct to unify is understandable. Do not. Both modes are live,
neither is broken, and a unification is a high-risk change to the aggregate every other feature
depends on.

**Build instead** One parameterized conformance suite that runs the same expectations against both
implementations. That converts an unbounded structural risk into a bounded, tested one for **M**
effort and near-zero regression risk. Roadmap step 13.

**Revisit unification** only if the suite proves the implementations have diverged in ways that
cannot be reconciled cheaply, or if a mode is retired.

### Server-side render pipeline

**Why not yet** A worthwhile eventual destination — it removes the browser dependency entirely
(**R4**) and unlocks captions, burn-in and publishing. But it means video infrastructure: workers,
queues, storage lifecycle, cost control. The client-side render at save time (F-01) delivers the
same _user-visible_ outcome for a fraction of the cost.

**Revisit** when the browser dependency actually blocks something, or when publishing arrives.

### Splitting the five large components

**Why not yet** None is incoherent; each has defensible single ownership. Splitting them as a
campaign is exactly the refactoring-as-progress this audit is meant to avoid.

**Instead** Split one when a change lands in it.

### Realtime Live AI Beta

**Why not yet** It is not deferred so much as **correctly parked**: the route, surface and provider
integration exist behind `REALTIME_VIDEO_BETA_ENABLED`, off by default, with a sibling surface that
explains why when it is unavailable. That is the right state for an unfinished capability.

---

## The one thing on this page worth reconsidering early

**Several placements from one cut.** It is the only deferred item whose value is comparable to the
P1 findings, and its entire cost is F-01. If F-01 is built with more than one specification per save
in mind, this becomes a small follow-on rather than a project — which is why roadmap step 4's
prompt asks the implementer to leave room for it without building it.
