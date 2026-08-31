# Organize Projects with optional Campaigns

## Story

As the authenticated operator, I can group related Projects in a lightweight Campaign without
making Campaign setup a prerequisite for creative work.

## Journey

1. Open **Campaigns** from the primary Studio navigation. Active and archived Campaigns load as
   separate bounded lists; no Project revision or media bytes are loaded for these summaries. Each
   row carries its own compare-and-swap version, so it can be edited, archived, restored or deleted
   without first opening it. Both sections can be searched by name — debounced, applied from two
   characters — and each states a real bounded count rather than the number currently loaded. A row
   carries a generated cover rather than a poster, because a Campaign organizes work instead of
   producing it; the Projects listed inside a Campaign lead with the same poster the Projects list
   shows, from the same response.
2. Choose **Create Campaign**, enter a required Name and optional Brief, and submit. Creation is
   idempotent and opens `/campaigns/:campaignId` immediately. A success callout offers **Create
   Project in Campaign** or **Not now**.
3. Choose the persistent **New Project** action, enter a name with the active Campaign fixed as
   the relationship source, or use **Create without a name** in the New Project dialog to create a
   standalone `Untitled Project`.
4. Campaign detail shows its active and archived Projects. Open one, move it to another active
   Campaign, or detach it to **No Campaign**. Membership changes use the Project version and never
   overwrite concurrent Project work silently.
5. In Projects, choose **No Campaign** to view standalone Projects. This is a query group, not a
   stored default Campaign.
6. Edit the Campaign Name/Brief, or archive it — from the Campaign list or from its detail page,
   which share one dialog per action. Archive changes only the organizer: every attached Project
   remains intact and openable, but no new or moved Project can attach until restore.
7. Restore an archived Campaign to accept membership again. To delete the organizer, first move or
   detach every active and archived Project, then explicitly confirm **Delete Campaign**. A
   nonempty Campaign is blocked and no cascade action is offered.
8. **Create Campaign** on the Campaigns list reuses the same canonical dialog. Successful
   related Project creation opens `/projects/:projectId` with the existing `campaignId` relation.

## Boundaries

- One Project belongs to zero or one Campaign; one Campaign can group many Projects.
- Ownership always comes from verified server identity. Campaign IDs from the browser are only
  requested targets and must resolve to the same owner inside the mutation boundary.
- Campaign owns only its name, optional brief, lifecycle, timestamps, and compare-and-swap
  version. It does not own Project revisions, media, jobs, outputs, reusable resources, or bytes.
- Campaign create/edit/archive/restore/delete and Project move/detach are authenticated,
  trusted-origin mutations. Lists are cursor-bounded, and create replays use durable operation
  receipts.
- Campaign and empty-Project views do not acquire camera/microphone access, start a provider, or
  claim that a Project is resumable before durable source acceptance succeeds.
- The current product remains loopback-only, single-operator, and video-focused. Rich planning,
  tags, dates, approvals, publishing, collaboration, and public accounts remain deferred.

## Failure and recovery

- A stale Campaign or Project version returns a safe conflict; the UI does not overwrite it.
- An archived, missing, deleted, or different-owner target rejects create/move without revealing
  another owner's Campaign.
- A nonempty archived Campaign explains that all active and archived Projects must be moved or
  detached before deletion.
- Refresh and application restart preserve Campaigns, membership, operation receipts, and
  standalone Projects in the selected persistence mode.
