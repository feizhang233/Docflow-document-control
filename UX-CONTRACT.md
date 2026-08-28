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

Workflow numbering, Workflow comments/state, Aconex matching, and external workflow APIs are explicitly outside this frontend migration.

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
| Select/Listbox | native `<select>` | this contract + DESIGN | native | keyboard + open popup |
| Date | native date input | API date-only schema | native | locale + browser |
| Form | shared `.form-grid` + in-page editor canvas + per-form validation | this contract | create / edit / bulk | validation browser flow |
| Scrollbar | global application stylesheet | DESIGN | stable-gutter exceptions | computed style |
| Toast | Sonner provider | this contract | success / error | live-region/browser |
| CRUD | package API hooks + editor/drawer/table | API + this contract | stay in register | full-flow browser |

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
- Responsive table strategy: horizontal table scrolling with visible synced overflow; no silent column removal.
- Truncation/full-value access: identifiers remain readable; full record is available through the View action/drawer.
- Focus restoration and sticky-obstruction policy: dialogs return focus, sticky topbar uses scroll padding, and modal actions remain reachable.

## Overlays and feedback

- Dialog primitive: shared `ConfirmDialog` for destructive confirmation. Document create, edit, and bulk edit occupy the register content canvas as in-page forms, not overlay dialogs.
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
- Offline/read-stale/write behavior: React Query may retain prior list data; mutations do not claim success without response.
- Retry/backoff/timeout behavior: user-driven retry on persistent page errors; no infinite custom retries.
- Version conflict and multi-tab behavior: backend does not expose a version contract; no force-overwrite UI is introduced.
- Session expiry/re-authentication: auth layer refreshes or returns to sign-in while preserving requested route.
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

- Permission UI strategy: irrelevant navigation/actions are hidden; direct forbidden settings access receives an access-denied state.
- Clipboard copy policy: no secret-copy feature exists.
- Disabled-state explanation: controls with an obvious pending reason use busy state; permission-disabled controls need visible explanatory text.

## Migration status

- Migration ledger location: this section.
- Canonical primitives and owners: CSS tokens, `ConfirmDialog`, secret input, app shell, PageState, PackageTable, Sonner.
- Current risk-prioritized slices: native dialogs, authentication inputs, register search/table, application shell, settings surfaces.
- Legacy import/token enforcement: premium audit plus anti-pattern grep.
- Rollout/rollback and removal gates: frontend-only change; backend and Workflow/Aconex contracts remain untouched.

## Verification

- Required static commands: frontend lint/build, backend pytest, strict premium audit, DESIGN lint, anti-pattern grep.
- Browser/device/locale/theme matrix: 1440px desktop and narrow mobile; light/dark; en-GB; reduced motion.
- Accessibility checks: keyboard focus, modal Escape/focus, search clear, open native select, table overflow.
- Component-state/visual regression coverage: browser screenshots of login, dashboard, register, settings, dialog.
- Canonical sibling flow used for comparison: Documents, Workflow, and Transmittal registers share one owner.
- Project audit command/result: recorded in task completion evidence.
- CRUD full-flow evidence: browser create/view/edit/delete flow when the local backend is available.
- Failure-path evidence: invalid login, filtered empty, and destructive mutation error state.
