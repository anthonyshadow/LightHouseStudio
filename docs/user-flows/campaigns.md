# Campaigns

Campaigns are an **optional organizer**. A Campaign owns nothing: it is a name, an optional brief,
a status, and a CAS version (`packages/domain/src/campaigns/types.ts:1315-1327`). Project working
state is never owned by a Campaign — the comment at
`packages/domain/src/projects/types.ts:173` states this explicitly, and the `campaignId` column
lives on the Project.

## Entity and rules

| Field     | Notes                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| `name`    | 1–120 chars, control characters stripped, whitespace collapsed                    |
| `brief`   | ≤1000 chars, optional, newlines preserved and collapsed to at most one blank line |
| `status`  | `active` · `archived` · `deleted`                                                 |
| `version` | CAS token for every metadata or lifecycle mutation                                |

Lifecycle rules (`packages/domain/src/campaigns/rules.ts`):

- Only an **active** campaign can be archived (`:1500-1502`).
- Only an **archived** campaign can be restored (`:1522-1527`) or deleted (`:1549-1551`).
- Deletion additionally requires the campaign to be **empty**; a non-zero attached project count
  returns a `campaign-not-empty` conflict carrying the count (`:1552-1562`).
- Deletion requires an explicit `'tombstone'` confirmation value (`:1563-1568`).
- Archiving a campaign does **not** archive or move its projects.

## API surface

| Method | Path                                                     | Notes                                                  |
| ------ | -------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/campaigns`                                         | `lifecycle`, cursor paging                             |
| POST   | `/api/campaigns`                                         | Idempotency-Key required                               |
| GET    | `/api/campaigns/:id`                                     |                                                        |
| PATCH  | `/api/campaigns/:id`                                     | Name + brief, `expectedVersion`                        |
| POST   | `/api/campaigns/:id/archive` · `/restore` · `/tombstone` | `expectedVersion`; tombstone also takes a confirmation |
| POST   | `/api/projects/:projectId/campaign`                      | The **only** way to attach/detach a project            |

Membership is a Project mutation, not a Campaign mutation. `moveProjectToCampaign`
(`projects/rules.ts:737-759`) bumps the _project's_ version.

## Flow: Campaign list (`/campaign`)

**Entry** — nav "Campaigns", dashboard "All Campaigns" / Recent Work, Quick Create ▸ New Campaign
(router state `{ createIntent: 'campaign' }`).

**Journey**

1. `CampaignRouteSurface` sees no id and renders `CampaignsWorkspace`
   (`CampaignRouteSurface.tsx:617-621`).
2. Header: `h1` "Campaigns", an explanation that Campaigns are optional, and a single primary
   **Create Campaign** button.
3. Two sections — Active and Archived — each a card grid. Each card shows the name, the brief (or
   "No brief yet."), "Updated <date>", an **Open** button, a status pill, and, **only when
   archived**, a **Delete** button.
4. Loading / error+retry / per-lifecycle empty states are present (`:60-78`).

**Create** — `CampaignFormDialog` (name required, brief optional with a live character count) posts
`/api/campaigns` with a retained idempotency key, then navigates to `/campaign/{id}` carrying
router state `{ campaignCreated: id }`.

**Exit** — `/campaign/{id}`.

## Flow: Campaign detail (`/campaign/{id}`)

**Journey**

1. `useCampaignDetail` issues `GET /api/campaigns/{id}`. Pending renders "Loading Campaign…";
   error renders a danger notice with **Back to Campaigns** (`:322-336`).
2. Header: "← All Campaigns" breadcrumb, name, status pill, "Updated", brief.
3. Actions: **New Project** (hidden when archived) · **Create another Campaign** · **Edit** ·
   **Archive**/**Restore** · **Delete Campaign** (archived only).
4. When arriving straight from creation, a success notice appears: _"Campaign created — Create the
   first Project in {name}, or continue organizing later."_ with **Create Project in Campaign** and
   **Not now**. Both dismiss the router state (`:401-424`). This is the product's clearest
   next-step nudge.
5. When archived, a warning explains projects remain intact and the campaign must be restored
   before adding or moving projects into it (`:432-437`).
6. Two `CampaignProjectGroup` sections — Active Projects and Archived Projects — each backed by
   `useProjectList(lifecycle, campaign.id)`. Each row offers **Open** and **Move or detach**.

**Create a Project inside a Campaign** — `NewProjectDialog` is rendered with
`defaultCampaignId={campaign.id}` and `campaignLocked`, then navigates to the new project
(`:596-604`). This is a real, working flow.

**Move or detach** — `MoveProjectDialog` (`CampaignDialogs.tsx:105+`) uses `ProjectCampaignPicker`
and posts `/api/projects/{id}/campaign`.

**Archive / Restore** — a confirm `OverlayPanel` whose copy states archiving only changes campaign
visibility. On success an `aria-live` announcement fires and focus returns to the heading.

**Delete** — a confirm `OverlayPanel`. The `campaign-not-empty` conflict is translated into a
specific instruction: _"Move or detach every active and archived Project before deleting this
Campaign."_ (`:365-372`). On success, navigate to `/campaign` with `replace: true`.

## System behaviour summary

| UI action       | Request                                         | Follow-up                                                |
| --------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Open list       | `GET /api/campaigns?lifecycle=…&pageSize=20`    | infinite query                                           |
| Create          | `POST /api/campaigns` + Idempotency-Key         | cache detail, invalidate lists, navigate                 |
| Edit            | `PATCH /api/campaigns/{id}`                     | cache detail, invalidate lists                           |
| Archive/Restore | `POST …/archive` / `…/restore`                  | same                                                     |
| Delete          | `POST …/tombstone`                              | invalidate all campaign queries, navigate to `/campaign` |
| Move project    | `POST /api/projects/{id}/campaign`              | project caches invalidated                               |
| Project groups  | `GET /api/projects?lifecycle=…&campaignId={id}` | infinite query                                           |

## Exit points

- `/projects/{id}` from a project row or after creating a project in the campaign
- `/campaign/{newId}` from "Create another Campaign"
- `/campaign` after deletion or via the breadcrumb

## Answers to specific questions

- **After creating a campaign, where does the user land?** `/campaign/{id}`, with an explicit
  "create the first Project" next-step notice. This is the only place in the product that offers a
  guided next step after a create.
- **Can a Project be created from inside a Campaign?** Yes — `CampaignRouteSurface.tsx:596-604`.
- **What happens to projects when a campaign is archived?** Nothing. They stay attached, active and
  openable, and the UI says so.
- **Is deletion confirmed and reversible?** Confirmed twice (archive first, then an explicit
  confirmation dialog), and irreversible — but it destroys only the organizer, never project or
  media bytes.
- **Does the detail view show anything besides projects?** Name, brief, status, updated date, and
  the lifecycle notices. No aggregate stats, no thumbnails, no activity.

## Unverified

- Whether the campaign list is ordered by `updatedAt`. The contract does not specify ordering and
  the client does not sort.
