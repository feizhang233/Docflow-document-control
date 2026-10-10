# DocFlow API

All endpoints are served under `/api`. Interactive OpenAPI documentation is available at `/api/docs` when the backend is running.

## Authentication

Interactive UI endpoints require a signed-in DocFlow user. Login issues HttpOnly cookies (`docflow_access`, `docflow_refresh`). Send cookies with every browser request. API clients may instead send `Authorization: Bearer <access-token>`.

External automation endpoints still use an API key in the `X-API-Key` header and do not use user sessions.

Set secrets in `.env` before deployment:

```env
EXTERNAL_API_KEY=replace_with_a_long_random_api_key
AUTH_SECRET=replace_with_a_long_random_secret
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=replace_with_a_strong_password
BOOTSTRAP_ADMIN_NAME=Administrator
```

The first backend start creates the bootstrap administrator if the users table is empty. That account must change its password at first sign-in.

A shared read-only `guest` account is also created (password `1234567890`, Viewer role, all projects). It can view documents and notifications, has no Access (`iam:*`) permissions, and its password cannot be changed by the guest or by an administrator.

Never commit a production key or place it in a query string.

### Session

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in with username/email and password; sets auth cookies |
| `POST` | `/api/auth/refresh` | Rotate the refresh cookie and issue a new access cookie |
| `POST` | `/api/auth/logout` | Revoke the current refresh token and clear cookies |
| `GET` | `/api/auth/me` | Current user, roles, permissions, and project scope |
| `POST` | `/api/auth/change-password` | Change the signed-in user's password |

Login body: `{ "username": "admin", "password": "…" }`. Change-password body: `{ "current_password": "…", "new_password": "…" }` (minimum 10 characters). Authenticated user payloads include `password_locked`.

Responses: `200` authenticated payload, `401` invalid/expired session or credentials, `400` current password incorrect or the account password is locked.

### Identity and access

Roles are system-defined: `admin`, `document_controller`, `editor`, `viewer`. Permissions are assigned through those roles. Users may be limited to selected `project_codes`, or granted `all_projects`.

| Method | Endpoint | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/api/iam/users` | `iam:read` | List users |
| `POST` | `/api/iam/users` | `iam:write` | Create a user |
| `GET` | `/api/iam/users/{id}` | `iam:read` | Read one user |
| `PATCH` | `/api/iam/users/{id}` | `iam:write` | Update name, email, roles, project scope, or active flag |
| `POST` | `/api/iam/users/{id}/reset-password` | `iam:write` | Set a temporary password and revoke sessions |
| `GET` | `/api/iam/roles` | `iam:read` | List roles and their permissions |
| `GET` | `/api/iam/permissions` | `iam:read` | List permission catalog |
| `GET` | `/api/iam/audit` | `iam:read` | Recent access events (`limit`, `offset`) |

Create-user body includes `username`, `display_name`, `password`, `role_slugs`, optional `email`, `all_projects`, `project_codes`, and `read_only_projects`. The last active administrator cannot be demoted or disabled. The Guest account password cannot be reset, and its Viewer role cannot be changed.

Internal document, settings, notification, and backup routes now require the matching permission. Missing authentication returns `401`; missing permission returns `403`. Project-scoped users receive `403` when they request another project.

### Per-project view-only access

`read_only_projects` lists assigned project codes that override document actions to view only. For example, an Editor with `project_codes: ["NFS", "FST"]`, `all_projects: false`, and `read_only_projects: ["NFS"]` can read both projects but only edit FST. Unlisted assigned projects follow the account's role permissions; an override never grants permissions absent from the role. Viewer stays read-only everywhere. Administrators always have all-project access and no read-only overrides.

These restrictions are enforced on create, edit, duplicate, delete, move (both source and destination), and reorder. Workspace settings and metadata imports are blocked when an account has any read-only project, since those operations can affect the whole workspace. Project renaming preserves access assignments, overrides, and email subscriptions. A project used by an access assignment or subscription cannot be removed until those references are removed.

## External workflow automation

### Update a workflow

```http
PATCH /api/external/workflows/{workflow_number}
X-API-Key: your-api-key
Content-Type: application/json
```

The endpoint is intended for a daily synchronization script. It locates the document by Workflow Number, applies the supplied fields, and creates categorized unread notifications in DocFlow. A request with actual changes to both Submission Progress and Workflow Feedback creates one notification in each category. Repeating an unchanged update does not queue email or create another bell notification.

All body fields are optional, but at least one workflow or feedback field must be supplied:

```json
{
  "submission_progress": {
    "Email Feedback": true
  },
  "feedback": {
    "UTIBER": true,
    "GDS": false,
    "Terminate": false
  },
  "feedback_status": {
    "UTIBER": "B",
    "GDS": "P"
  },
  "terminate_workflow": false,
  "message": "Daily Aconex sync completed the workflow."
}
```

Partial progress, feedback, and feedback-status objects are merged with existing values. When several packages share the same Workflow Number (revisions), **every matching package** is updated. Setting an approval status to `A`, `B`, or `C` automatically marks that reviewer stage complete. Automation cannot silently downgrade a stored `A`/`B`/`C` back to `P` via merge (stale bulk syncs used to wipe completed GDS/UTIBER stages); the document UI can still edit statuses directly. Set `feedback.Terminate=true` to grey the complete Feedback bar while Submission Progress keeps its existing colour. The default submission keys, in order, are:

- `Transmittal Preparation`
- `DCO Backup`
- `Workflow Prepare`
- `Email Feedback`

The default feedback keys are `UTIBER`, `GDS`, and `Terminate`. Administrators can rename/reorder these fields in Settings; automation clients must use the currently configured names returned by `GET /api/settings/workflow`. `terminate_workflow` controls the separate, selectable Terminate Workflow status in the Workflow register and document detail card.

Feedback status codes:

- `A`: Approved
- `B`: Approved with comments
- `C`: Rejected
- `P`: Pending

The effective status shown in the UI follows the review sequence: before UTIBER responds it shows `P`; while GDS is pending it shows the UTIBER result; after GDS responds it shows the GDS result; terminated Feedback shows `Terminated`.

Example:

```bash
curl -X PATCH 'https://documents.example.com/api/external/workflows/WF-2026-0080' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your-api-key' \
  -d '{"feedback_status":{"UTIBER":"B","GDS":"P"},"feedback":{"Terminate":false}}'
```

Responses:

- `200`: updated document metadata
- `400`: no workflow fields supplied
- `401`: missing or invalid API key
- `404`: Workflow Number not found
- `422`: invalid field or progress/feedback key

### Replace all workflow comments

```http
PUT /api/external/workflows/{workflow_number}/comments
X-API-Key: your-api-key
Content-Type: application/json
```

This endpoint writes the complete current comment snapshot for one workflow
number. Matching is by workflow number only (not package/document name). A
package does not need to exist first. Each successful request atomically
replaces the comments previously stored for that workflow number. Send an empty
`comments` array to clear the snapshot.

```json
{
  "comments": [
    {
      "external_id": "aconex-comment-1042",
      "author": "GDS reviewer",
      "body": "The complete review comment, without notification-length truncation.",
      "commented_at": "2026-07-24T14:47:00"
    },
    {
      "external_id": "aconex-comment-1043",
      "author": "UTIBER reviewer",
      "body": "A second complete comment.",
      "commented_at": "2026-07-24T15:02:00"
    }
  ]
}
```

`external_id`, `author`, and `commented_at` are optional. `body` is required and
supports up to 1,000,000 characters. Up to 1,000 comments may be written per
snapshot. The response contains the saved comments in request order.

Responses:

- `200`: complete comment snapshot replaced
- `401`: missing or invalid API key
- `422`: invalid comment payload

### Bulk import workflow comments

```http
PUT /api/external/workflow-comments
X-API-Key: your-api-key
Content-Type: application/json
```

Import complete Final Mail comment snapshots for many workflows in one request.
This is the preferred endpoint for Aconex SQLite → DocFlow comment synchronization.
Each item atomically replaces the comments previously stored for that workflow
number. Matching is by **workflow number only** — never by document number or
package name. A package does not need to exist first; any document that uses the
workflow number will read the same shared comment snapshot.

Up to 5,000 workflow items may be sent per request. Each item may contain up to
1,000 comments with the same field rules as the single-workflow endpoint.

```json
{
  "items": [
    {
      "workflow_number": "WF-000527",
      "comments": [
        {
          "external_id": "681130933",
          "author": "Mr Slobodan Ivkovic",
          "body": "The complete Final Mail review comment, without truncation.",
          "commented_at": "2025-12-04T11:46:09.640Z"
        }
      ]
    },
    {
      "workflow_number": "WF-000630",
      "comments": [
        {
          "external_id": "681428335",
          "author": "Mr Slobodan Ivkovic",
          "body": "Another complete comment.",
          "commented_at": "2026-01-21T08:13:23.630Z"
        }
      ]
    }
  ]
}
```

Example response:

```json
{
  "imported": 2,
  "results": [
    {"workflow_number": "WF-000527", "status": "imported", "total": 1},
    {"workflow_number": "WF-000630", "status": "imported", "total": 1}
  ]
}
```

Responses:

- `200`: bulk import completed (see `imported` count)
- `401`: missing or invalid API key
- `422`: invalid payload

## Project email notifications

Notification interface copy, generated titles, email subjects and template labels default to English regardless of browser language. Email messages declare `Content-Language: en`. Comments, document values, custom project labels and external messages retain their original text.

Every system role, including Viewer and Guest, has `notifications:subscribe` to manage its own notification emails. Each account can save at most 5 distinct normalized email addresses, including paused subscriptions. One address can subscribe to multiple accessible projects and counts once. Each owner/project/email combination is unique; different accounts may independently use the same address. Other accounts, including administrators, cannot list or modify these personal subscriptions. Recipients do not need login accounts, and the account login email is never subscribed automatically. View-only project access permits subscriptions while continuing to block document mutations.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/email-subscriptions?offset=0&limit=50` | Own subscriptions, total, `address_count`, `address_limit` (5), `mail_configured`, and latest delivery status/error |
| `POST` | `/api/email-subscriptions` | Subscribe an email to one project |
| `PATCH` | `/api/email-subscriptions/{id}` | Pause/resume with `{ "is_active": false/true }` |
| `DELETE` | `/api/email-subscriptions/{id}` | Remove the subscription and its email queue/history |
| `POST` | `/api/email-subscriptions/{id}/retry` | Requeue failed deliveries for an active subscription |

Creation body:

```json
{
  "project_code": "NFS",
  "email": "reviewer@example.com",
  "event_types": ["document", "submission_progress", "workflow_feedback", "workflow_comments"]
}
```

At least one event type is required; all four are selected by default. The same email can subscribe to several projects, but each owner/project/email combination is unique (`409` for a duplicate, `422` when adding a sixth distinct address). Subscriptions only send future changes. Create/edit/delete/duplicate, workflow synchronization, and JSON/CSV register import produce email events. Imports produce one summary per affected project. Row reordering does not send email.

Emails contain document/workflow identifiers, changed fields with before/after values, and current workflow comments. Comment synchronization emits a `workflow_comments` bell notification and email per affected project, including previous and current comments. Identical snapshots (including equivalent timestamp offsets) are ignored. A shared workflow's document list in each email contains only that project's documents. Comments without a matching document are stored without sending an email; later document creation/assignment includes the stored comments.

Email is queued in the same transaction as each document/comment change. The API does not wait on SMTP. The backend sends queued email automatically, checking every `EMAIL_POLL_SECONDS` (default 30). Failures retry with exponential backoff, up to five attempts, then remain `failed` for an explicit retry. Worker leases prevent concurrent workers from handling the same row; expired leases recover after restart. SMTP delivery is at least once: a crash after provider acceptance but before recording `sent` may cause a repeat, with the same Message-ID. A `sent` status means the mail server accepted the message, not confirmation that a person received/read it.

Pausing cancels queued deliveries; resuming only sends new changes. An email already being handed to SMTP may complete. Before enqueueing and sending, the worker checks the owner's active status, project scope, and `notifications:subscribe`; revoked access cancels delivery. Owners can still list, pause and delete their own revoked-project subscriptions to free address slots. Resume/retry requires current project access and never transfers ownership. Existing addresses over the limit are preserved for removal; no new distinct address may be added until below 5. Concurrent additions are serialized per account in MySQL. Moving a document notifies the old project only that it moved out; updated content is sent to the destination project's subscribers.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_EMAIL`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_SECURITY` (`starttls`, `ssl`, or `plain` for a trusted local relay), then restart the backend. Credentials stay in server environment variables. `PUBLIC_APP_URL` optionally adds a link to the record. With no mail configuration, the UI shows a setup notice and changes remain queued. No real emails are sent by automated tests.

## Notifications

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/notifications?limit=30` | List newest notifications and unread count; optionally filter by `package_id`, `notification_type`, and `project_code`; each item includes its current package's `project_code` for permission-aware browsing links |
| `PATCH` | `/api/notifications/{id}/read` | Mark one notification as read |
| `PATCH` | `/api/notifications/read-all` | Mark every notification as read |

Notifications are generated through the UI or external automation endpoint and returned with one of these `notification_type` values:

| Type | Generated for |
| --- | --- |
| `submission_progress` | Submission Progress changes |
| `workflow_feedback` | Feedback, Feedback Status, or Workflow termination changes |

The notification popover displays these types in separate Submission Progress and Workflow Feedback sections. Legacy notification records are migrated into the appropriate category where possible.

The former Workflow Status field is removed. Feedback is now the workflow feedback state, with `UTIBER`, `GDS`, and `Terminate` options.

## Documents

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/packages` | Search, filter, sort, and paginate documents |
| `GET` | `/api/packages/transmittals` | Next transmittal in each PZI/RFI/RPT series for a project, plus used numbers |
| `POST` | `/api/packages` | Create a document; blank Document Number becomes a unique `DRAFT-*` number |
| `POST` | `/api/packages/{id}/duplicate` | Duplicate metadata using a unique `-COPY` Document Number |
| `GET` | `/api/packages/{id}` | Read complete document metadata |
| `GET` | `/api/packages/{id}/workflow-comments` | Read the complete workflow comment snapshot |
| `PATCH` | `/api/packages/{id}` | Update supplied fields |
| `DELETE` | `/api/packages/{id}` | Delete a document |
| `POST` | `/api/packages/reorder` | Persist row ordering |

List parameters: `period=week|month|year|all`, `project_code=NFS|FST|FBP`, `search`, `discipline`, `document_type`, `transmittal_prefix`, `sort_by`, `sort_order`, `page`, and `page_size`. Omitting `project_code` returns all projects. `transmittal_prefix` performs a starts-with match against the Transmittal Number.

Every package response includes `project_code`. New packages default to `NFS` when it is omitted; `FST` represents Fire Station and `FBP` represents Footbridge. Workflow Numbers remain shared and are not project-prefixed. Assigning a Workflow Number on update (empty to a value) without an explicit `submission_progress` payload completes every Submission Progress stage for that document's project.

`GET /api/packages/transmittals?project_code=` returns `series` (PZI, RFI, and RPT prefixes with the latest issued number and the next suggested number) and `used` transmittal numbers for that project. Series are independent: if `NFS-PCH-TRA-RPT-465` exists, the RPT suggestion is `NFS-PCH-TRA-RPT-466` while PZI and RFI keep their own sequences. Duplicate transmittal numbers are allowed; the editor warns and can continue.

Lifecycle fields accepted by create/update and included in metadata backups are `notes`, `has_attachment`, `is_abandoned`, and `workflow_terminated`. Setting `is_abandoned=true` greys both progress tracks in the UI without deleting their recorded steps.

## Workflow, column settings, and metadata backup

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/settings/columns` | Read Document design and per-register visibility configuration |
| `PUT` | `/api/settings/columns/{field}` | Update Document column labels, width, visibility, and input options. Initiator and Discipline also accept `share_options` and per-project `project_options` / `project_option_colors` |
| `PUT` | `/api/settings/columns/{field}/visibility?register=workflow\|transmittal` | Update visibility only for the selected register |
| `GET` | `/api/settings/workflow` | Read Submission stages, Feedback reviewers, A/B/C/P labels, and Transmittal filter prefixes |
| `PUT` | `/api/settings/workflow` | Update workflow structure, Transmittal prefixes, and remap existing document state by position |
| `GET` | `/api/metadata/export` | Export documents and settings as JSON |
| `POST` | `/api/metadata/import?mode=merge` | Merge a metadata backup |
| `POST` | `/api/metadata/import?mode=replace` | Replace current metadata from a backup |
| `POST` | `/api/metadata/import-csv?mode=merge` | Merge document rows parsed from a CSV file |
| `POST` | `/api/metadata/import-csv?mode=replace` | Replace the document register with CSV rows |

`PUT /api/settings/workflow` requires 1–12 unique `submission_steps`, exactly two unique `feedback_reviewers`, labels for all four fixed status codes (`A`, `B`, `C`, `P`), and at least one `transmittal_prefixes` entry. Optional `project_submission_steps` maps a project code to its own 1–12 stage names; omitted projects use the default `submission_steps`. Existing document progress is remapped by stage position when a list changes. Workflow configuration is included in metadata exports and restores. Legacy `Signature Process` and `Workflow Initiation` names are merged into `Workflow Prepare`.

CSV imports accept a JSON body with `rows` after the browser parses a selected CSV file. The Settings screen supports the same headers emitted by CSV export: `document_number`, `document_date`, `document_type`, `initiator`, `discipline`, `number_of_documents`, `transmittal_number`, `workflow_number`, `workflow_terminated`, `has_attachment`, `is_abandoned`, and `notes`. In merge mode, a matching Document Number updates only columns present in the CSV; new rows receive the active Workflow defaults.

## System

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API and database health check |

Lost MySQL connections return `503` and reset the connection pool so the next request can reconnect.

## Browsing interface

The left sidebar exposes Notification as an independent entry with Updates and Email addresses sections. A Viewer, an account with all assigned projects set to view only, or a mixed-access account browsing a view-only project sees only Dashboard, Documents and Notification. Direct Workflow, Transmittal and Settings routes redirect to Documents while preserving project and record query parameters. A mixed-access account regains its role interface when it selects an editable project.

Document Number remains visible and configurable in every register. The Docs (`number_of_documents`) column is removed from Documents, Workflow, Transmittal and column settings for all accounts, and cannot be restored through column visibility/reset endpoints. The document count remains in detail/edit forms, stored data, exports and integrations.
