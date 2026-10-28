# UX Contract

## Product context

- Audience: document controllers, project administrators, engineers, and read-only reviewers.
- Primary jobs: locate records, maintain metadata, monitor submission/workflow/transmittal state, and administer project access.
- Target market(s): international engineering projects.
- Active locales: English (`en-GB`).
- Language/content register and native-review policy: concise operational English; domain tokens are not translated.
- Timezone/calendar policy: browser-local display for activity time, Gregorian date-only storage for document dates.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `API.md`, `backend/app/core/iam_catalog.py`, server route guards | API / permission implementation | 2026-08-27 |
| Data lifecycle | `API.md`, package schemas/services | API / domain implementation | 2026-08-27 |
| Deletion / retention | Package delete endpoints; permanent-delete wording in existing UI | API / implementation evidence | 2026-08-27 |
| Billing / payment | Not applicable | n/a | 2026-08-27 |
| Legal / regulatory copy | Not maintained in this repository | unresolved, no new legal copy introduced | 2026-08-27 |
| Market / content conventions | `README.md`, `PROJECT_STRUCTURE.md` | product documentation | 2026-08-27 |

Workflow numbering and Aconex matching remain unchanged. The 2026-10-09 access/notification feature adds project read-only overrides and notifications for actual comments changes while retaining workflow-number matching.

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: existing runtime CSS is canonical; `DESIGN.md` mirrors accepted values.
- Runtime design-system/token source: `frontend/src/styles/index.css`.
- Mapping/export/adapters: semantic CSS variables consumed by shared classes and components.
- Token drift gate: DESIGN lint, premium static audit, build/lint, and representative browser screenshots.
- Supported themes: light and dark, plus forced-colours fallback.
- Design-context owner/review policy: global token changes update CSS and `DESIGN.md` together.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | `PackageTable` + `PackagesPage` selection bar | this contract | page only | keyboard + browser |
| Column layout | `PackageTable` + `columns.ts` + `useColumnPreferences` | current account/register preferences API, then register order and shared visibility defaults | header dragging / Columns controls | reload + account isolation + keyboard |
| Select/Listbox | native `<select>` | this contract + DESIGN | native | keyboard + open popup |
| Date | native date input | API date-only schema | native | locale + browser |
| Form | shared `.form-grid`/modal shell + per-form validation | this contract | create / edit / bulk | validation browser flow |
| Scrollbar | global application stylesheet | DESIGN | stable-gutter exceptions | computed style |
| Toast | Sonner provider | this contract | success / error | live-region/browser |
| CRUD | package API hooks + editor/drawer/table | API + this contract | stay in register | full-flow browser |
| Session recovery | `app/AuthProvider` + `httpClient.ts` + `AuthSessionCoordinator` | backend stable session and 24-hour absolute deadline | startup / request retry / explicit sign-out | concurrency + expiry + browser reopen |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | semantic emphasis | tonal lift | 3px focus ring | 1px press | muted/no pointer | fixed geometry + spinner | inline/dialog recovery |
| Icon button | 36–40px target | tinted surface | visible ring | pressed tint | muted | disabled | adjacent status |
| Input | 40px bordered | stronger border | blue ring | n/a | muted surface | reserved adornment | text + aria state |
| Secret input | masked | as input | field + toggle focus | reveal toggle | n/a | n/a | inline/banner |
| Search | clear + 300ms debounce | field tint | blue ring | immediate clear | n/a | stable adornment | table region |
| Textarea | resize none | stronger border | blue ring | n/a | muted | n/a | inline |
| Table/list | stable rows | row tint | action focus | selected tint/marker | n/a | stable state panel | retry panel |

## Dataset navigation

- Admin tables: server pagination.
- Exploratory lists: bounded dashboard lists with explicit “View all”.
- URL state: project/focus context remains URL-owned; committed register search, filters, sort, page, and page size are mirrored to URL.
- Page size: 50/100/200, default 200 to preserve the existing workflow.
- Empty/no-results/error/loading treatment: shared `PageState` footprint; filtered empty offers a clear path.
- Back/scroll restoration: project and register route remain stable; drawer/editor stay in the owning register.
- Selection scope: current page only; exact count shown; filter changes remove invisible selection; destructive bulk confirmation names count and consequence.
- Column visibility: right-click any register header or use the visible Columns button to open the same checkbox popover. Hidden columns remain listed and can be restored individually or with Show all. Drag/selection and row actions remain available even when all data columns are hidden. Keyboard users can use Columns or Shift+F10/ContextMenu from a header. Escape dismisses and restores focus to the surviving trigger or Columns button.
- Personal column choices are stored in the database by authenticated account and register (`documents`, `workflow`, `transmittal`). Reloading, signing out/in, or opening another browser restores saved choices. Shared settings supply defaults only for fields without a personal override. Personal visibility changes are available to every signed-in account, including view-only accounts; they grant no document or workspace-setting permission.
- Column order uses the same account/register preference scope. Drag a heading's dedicated handle to change its position; header sort buttons and resize separators retain their own operations. Header cells, row cells and Columns choices follow one ordered field list. Hidden fields stay in the saved order; restoring visibility does not reset their positions. Selection/reorder and row-action columns remain fixed. Keyboard and button alternatives provide the same personal order changes. Reset order restores the register's default sequence without changing visibility. New or omitted supported fields append in default order.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create | New document | stable Save button | owning register | Document created | editor remains/retry | register context | package API |
| Edit | Save document | stable Save button | owning register | Document updated | editor remains/retry | register context | package API |
| Delete | Delete document | danger dialog busy | owning register | deleted permanently | dialog error + retry | next register context | package API |
| Search | register search | stable table state | same route/query | result count | retry/clear | input/results | package list API |
| Bulk action | explicit toolbar verb | stable toolbar/dialog | owning register | succeeded/failed counts | preserve failed scope | toolbar/register | package API |
| Upload/background job | choose JSON/CSV | stable review card | settings section | import result toast | review retained | review card | settings API |
| Cancel/back | Cancel/close | none | owning context | none | unsaved dialog where implemented | trigger/context | UI contract |
| Soft-delete | Abandon submission | mutation pending | owning register | server-confirmed update | toast/retry | row | package API |
| Hard-delete (irreversible) | Permanently delete | app-owned danger dialog | owning register | permanent-delete toast | dialog retry | next row/register | package API |

## Navigation and responsive behavior

- Route document title policy: `{Page} — DocFlow`.
- Route error / 403 page behavior: dedicated in-shell explanation with return to dashboard; login is only for unauthenticated users.
- Breadcrumb/tab/route-state policy: breadcrumbs encode Document Control → Project → Register; settings tabs are peer sections.
- Sidebar/drawer/bottom-sheet transformation: persistent/collapsible desktop sidebar with one directional toggle anchored in the Workspace heading; its expanded state and accessible label stay synchronized. Below 900px, navigation becomes a modal left drawer with a separate top-bar trigger and no desktop collapse control.
- Notification sits immediately above Settings in the shared bottom navigation, using the same `NavLink` and `.nav-item` treatment without a separate Updates heading or region. It remains available when Settings is hidden for view-only browsing, retains the selected project in its destination, and closes the mobile navigation on selection.
- Responsive table strategy: horizontal table scrolling with visible synced overflow; no silent column removal.
- Truncation/full-value access: identifiers remain readable; full record is available through the View action/drawer.
- Focus restoration and sticky-obstruction policy: dialogs return focus, sticky topbar uses scroll padding, and modal actions remain reachable.

## Overlays and feedback

- Dialog primitive: shared `ConfirmDialog` for destructive confirmation; document create/edit/bulk use the editor modal shell portaled to the viewport so the dimmed backdrop covers the whole page, not only the register table.
- Destructive confirmation levels: abandonment/termination are warning operations; API deletion is irreversible danger.
- Toast placement/duration/deduplication: one Sonner viewport, top-right, routine auto-dismiss, error persists long enough to read.
- Alert/banner scope and persistence: field/form errors inline; route/data failures use persistent state panels.
- Tooltip delay/dismissal: native title is not the contract; visible labels/accessibility names are required.
- Unsaved-changes behavior: editor close is explicit; router/unload guard remains a future hardening item.
- Layer/z-index contract: dropdown 200, popover 300, header 400, backdrop 500, dialog 600, drawer 700, command 800, toast 900.

## Async and resilience

- Mutation default: pessimistic for security, permission, bulk, delete, and imports; existing reorder remains optimistic with rollback.
- Idempotency and duplicate-submit policy: pending controls disable duplicate activation.
- Auto-save/draft recovery: no auto-save; forms commit explicitly.
- Column layout is an immediate personal preference save: keep the confirmed visibility and order until the server responds and disable duplicate changes while saving. A failed save leaves the prior confirmed layout and shows an error. Visibility and order patches preserve each other. Initial preference/configuration loading blocks table rendering to prevent flashing shared defaults; a loading failure offers Retry and never writes defaults over stored preferences. Query keys include account ID and register; a late save updates only its original scope.
- Column preference requests send the displayed account's ID as an expected-account guard. The server rejects a mismatched session with 409 before reading or writing preferences, so a stale tab cannot apply its prior account's layout to a newly signed-in account. The guard never selects an account or grants access.
- Offline/read-stale/write behavior: React Query may retain prior list data; mutations do not claim success without response.
- Retry/backoff/timeout behavior: user-driven retry on persistent page errors; no infinite custom retries.
- Version conflict and multi-tab behavior: backend does not expose a version contract; no force-overwrite UI is introduced.
- Session expiry/re-authentication: sign-in lasts 24 hours from login. Persistent HttpOnly cookies restore the session on browser reopen; short-lived access renews inside the original deadline. Backend session revocation and account permissions remain authoritative. Expiration returns to sign-in while preserving the requested route.
- Session recovery shares one refresh across parallel requests and serializes cookie-changing operations in the tab and, when supported, across tabs. Old-generation responses cannot restore an older user, refill a switched account's cache, or replay an action as another account. Account changes remount the owning UI to clear local detail/edit state. Login, password changes and logout wait for pending cookie operations; logout takes precedence over late renewal.
- Startup connection/server failures show an app-owned retry state without private content or a credential form. Existing signed-in views remain available after transient recovery failures. Only a confirmed authentication failure clears authentication. Explicit sign-out stores a non-secret browser marker, preventing automatic restoration until successful sign-in; storage events synchronize that intent across tabs. Tokens, passwords and private records are never cached in localStorage.
- Long-running progress and return path: not applicable to current synchronous APIs.
- Stale-request cancellation/invalidation and pending-state ownership: React Query keys own list state; debounced search commits only the latest input.
- Dialog/form preservation and retry after mutation failure: destructive dialog remains open on failure; editor values remain in component state.

## Validation

- Schema/validation layer: existing manual/component validation plus server schema.
- Trigger timing: submit, then inline correction.
- Error summary/inline policy: form banner for server failures; inline error for field-specific bulk validation.
- Server error mapping: sanitized `getApiError` response; no raw stack output.
- Sensitive-value handling: passwords masked with accessible reveal; never copied into toast, URL, or storage.
- Forms use `noValidate`, block duplicate submit, and preserve non-sensitive values after failure.

## Permission and clipboard

- Permission UI strategy: irrelevant navigation/actions are hidden; view-only Workflow/Transmittal/Settings direct routes redirect to Documents preserving query parameters.
- Clipboard copy policy: no secret-copy feature exists.
- Disabled-state explanation: controls with an obvious pending reason use busy state; permission-disabled controls need visible explanatory text.
- Project access (2026-10-09): `read_only_projects` overrides actions without granting any role permission. Tables/drawers/editors use the canonical `useAuth().can(permission, project)` check; mixed-project bulk actions require permission on every selected record. Reordering is disabled when any row in the page is read-only. The server applies the same restrictions. Global settings and metadata imports are unavailable when an account has read-only projects (source: `API.md`).
- Access edits use shared `ConfirmDialog` to review roles, project scope, and view-only overrides. Account changes clear cached data; project/role changes refresh on focus and every 30 seconds.
- Email subscriptions use native project select, shared settings form/cards, Sonner feedback, and `ConfirmDialog` for recipient disclosure and removal. The independent Notification page owns Updates and Email addresses. Subscription pagination is 100; address groups share one header per recipient. Every account may manage up to 5 distinct personal addresses across accessible projects, including view-only projects. Paused addresses count; removing the last project for an address frees a slot. Creation stays in its owning section; failures preserve fields and show inline/dialog errors. Pause/resume is reversible. The configuration notice states when delivery is unavailable. Latest delivery state is displayed as server-reported; no UI claim of inbox receipt is made (source: `API.md`).
- Sender setup help (2026-10-10) uses a native `<details>/<summary>` disclosure in Email addresses, available before and after mail configuration. It keeps English instructions in the owning page, distinguishes the shared server-side sending account from personal recipients, explains configuration/recreation/testing, and uses semantic theme tokens and wrapping examples on narrow screens. `EMAIL_SETUP.md` provides the complete English administrator guide. Help never reads or displays configured credentials and does not treat `mail_configured` as a verified connection.
- Comments have a separate bell group. Shared `notificationDestination` sends view-only links to Documents, and every notification includes the owning project for mixed-access navigation. `useWorkspaceAccess` is the canonical browsing-mode owner: Viewer/all-view-only accounts and selected view-only projects show Dashboard/Documents/Notification only. Browsing Dashboard shows recent documents, updates and personal email access. Notification project filtering is applied on the server before limiting to the latest 100 updates.
- Document Number is an available, configurable column in Documents, Workflow and Transmittal; each account can hide or restore it. The Docs (`number_of_documents`) column has no register header/cell and is absent from column settings for all accounts. Detail/edit counts remain available; resetting visibility cannot restore the Docs column.

## Migration status

- Migration ledger location: this section.
- Canonical primitives and owners: CSS tokens, `ConfirmDialog`, secret input, app shell, PageState, PackageTable, Sonner.
- Current risk-prioritized slices: native dialogs, authentication inputs, register search/table, application shell, settings surfaces.
- Legacy import/token enforcement: premium audit plus anti-pattern grep.
- Rollout/rollback and removal gates: deploy versioned migrations with their corresponding backend/frontend; structural cleanup preserves public API and Workflow/Aconex contracts and retains the migration history.

## Verification

- Required static commands: frontend lint/build, backend pytest, strict premium audit, DESIGN lint, anti-pattern grep.
- Browser/device/locale/theme matrix: 1440px desktop and narrow mobile; light/dark; en-GB; reduced motion.
- Accessibility checks: keyboard focus, modal Escape/focus, search clear, open native select, table overflow.
- Component-state/visual regression coverage: browser screenshots of login, dashboard, register, settings, dialog.
- Canonical sibling flow used for comparison: Documents, Workflow, and Transmittal registers share one owner.
- Project audit command/result: recorded in task completion evidence.
- CRUD full-flow evidence: browser create/view/edit/delete flow when the local backend is available.
- Failure-path evidence: invalid login, filtered empty, and destructive mutation error state.

### Access/email verification, 2026-10-09

Notification copy and generated email templates default to English (`Content-Language: en`), independently of browser locale. Comments and user-supplied project/document/external content remain in their source language.

Backend tests cover mixed project restrictions, scope-preserving rename, personal subscription isolation, the five-address limit including paused/shared-project addresses, Viewer subscription rights, revoked-project cleanup, project-filtered notification feeds, hidden Document Number column configuration, subscriber authorization, comments creation/removal/deduplication, shared workflow project isolation, bulk import summaries, queued delivery, TLS/Unicode mail construction, retry, pause/delete cancellation, expired leases, and worker startup. Browser verification was attempted but the browser tool blocked the local preview URL; responsive visual/keyboard runtime checks remain unverified in this environment. 68 backend tests, strict static UI audit and frontend lint/build pass. React server rendering with account/project fixtures verifies Viewer, all-view-only and mixed-project navigation, browse Dashboard, Notification sections, permission-aware comments links and removal of Document Number in all three tables. Migration 26 to 27 preserves existing subscription rows and installs owner-specific uniqueness in an isolated SQLite database. Browser visual, keyboard and click flows remain unverified because the local URL was blocked; server rendering does not replace those checks.


### Register column correction, 2026-10-10

The clarified requirement restores Document Number in every register and removes only the Docs count column. The current column contract above supersedes the earlier removal. 68 backend tests, frontend lint/build and strict UI audit pass. React rendering verifies Documents, Workflow and Transmittal for both view-only and editing accounts: Document Number appears once, remains sortable, and Docs headers, values and width are excluded even with legacy visible column settings. Stored counts, detail/edit forms and exports retain their data.

### Sending mailbox instructions, 2026-10-10

Frontend lint/build, 68 backend tests and strict static UI audit pass. React server rendering confirms the native disclosure contains the four setup steps, container recreation command and official provider help links. Existing browser access restrictions still leave visual/keyboard runtime checks unverified. This change adds setup instructions only; no live SMTP credentials were configured and no real email was sent.

### Sidebar notification placement, 2026-10-10

Frontend lint/build, 68 backend tests and strict static UI audit pass. React rendering with editing and view-only fixtures confirms Notification is in the shared bottom navigation, directly before Settings when available, for expanded, collapsed and mobile-open states. The selected project and active-route indicator are retained. The obsolete notification region is absent from markup and styles. Design tokens are unchanged. Browser visual/keyboard checks remain unverified under the existing access restriction; the official DESIGN linter is unavailable because its package is not cached locally.

### Personal register columns, 2026-10-28

Migration `20261028_28` persists account/register visibility independently of shared column defaults. All 87 backend tests pass, including authentication, read-only access, account/register isolation, sign-out/in persistence, strict validation, and concurrent sparse updates. Frontend build, lint (one existing refresh-export warning), diff check, and strict UI audit pass. Live local-browser checks now succeed: header right-click, hide/show, reload/new-tab/sign-out/in and API-restart durability, all-hidden recovery, keyboard focus, dark theme and narrow/short viewports. The chooser stays below the application header and scrolls its list while preserving Close and Show all. See `qa/column-visibility-20261028.md` for the tested flows and remaining limits. No production deployment was performed.

### Personal column order, 2026-10-28

Migration `20261028_29` adds saved column order and preserves existing visibility. All 106 backend tests pass, including migration preservation, account/register isolation, concurrent sparse order/visibility saves, reset, invalid orders and the expected-account guard. Frontend lint/build, diff check and strict UI audit pass; lint retains the existing refresh-export warning. Local Chrome verification covers pointer dragging, header/body alignment, hidden slots, keyboard and chooser moves, reset, independent registers, same-role accounts, read-only Guest, reload/new-tab/sign-out/in and API restart. A failed save leaves the confirmed order and shows an error. Sorting, resizing, row dragging and selection remain functional; dark/narrow/short viewports were checked. See `qa/column-order-20261028.md` for evidence and limits. No production deployment was performed.

### 24-hour sign-in retention, 2026-10-28

Migration `20261028_30` preserves stable sessions and overlapping refresh retries. All 121 backend tests and 9 frontend coordination tests pass, including absolute expiry, cookie persistence, concurrent refresh, revocation, legacy migration, stale generations and cookie-operation sequencing. Frontend build/lint and strict UI audit pass, with the existing refresh-export warning. Local Chrome checks used temporary five-second access tokens to verify three parallel 401s share one renewal, the original session deadline remains unchanged, reopening restores sign-in, logout synchronizes tabs, and account preferences stay isolated. Startup API failure hides private content and offers Retry; recovery needs no credentials. Simulated stored-session expiry correctly requires sign-in. The preview was restored to normal 30-minute access and 24-hour sessions. See `qa/session-24h-20261028.md` for evidence and limits. No production deployment was performed.

### Code cleanup, 2026-10-28

The table now coordinates shared column descriptors and dedicated header, chooser and row components. Authentication state/context and HTTP transport have separate owners; unused client wrappers, types and the unused table dependency were removed. Backend token-claim decoding and preference response mapping share implementations, with redundant session wrappers and cookie deletions removed. Runtime behavior and migration history remain intact. Removed 85 unused CSS rules, five exact duplicate rules and unused arms in four grouped selectors, retaining live shared selectors and dynamic class families. All 121 backend tests, 9 authentication tests, frontend build/lint and strict UI audit pass; frontend lint now has zero warnings. Local browser regression covers saved layouts, account isolation, read-only controls, renewal/reopen, and representative light/dark/narrow screens. See `qa/code-cleanup-20261028.md` for evidence and limits. No production deployment was performed.
