# DocFlow API

All endpoints are served under `/api`. Interactive OpenAPI documentation is available at `/api/docs` when the backend is running.

## Authentication

Internal UI endpoints currently rely on network access controls. The automation endpoint requires an API key in the `X-API-Key` header.

Set a long random key in `.env` before deployment:

```env
EXTERNAL_API_KEY=replace_with_a_long_random_api_key
```

Never commit a production key or place it in a query string.

## External workflow automation

### Update a workflow

```http
PATCH /api/external/workflows/{workflow_number}
X-API-Key: your-api-key
Content-Type: application/json
```

The endpoint is intended for a daily synchronization script. It locates the document by Workflow Number, applies the supplied fields, and creates categorized unread notifications in DocFlow. A request that updates both Submission Progress and Workflow Feedback creates one notification in each category.

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

## Notifications

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/notifications?limit=30` | List newest notifications and unread count; optionally filter by `package_id` and `notification_type` |
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
| `POST` | `/api/packages` | Create a document; blank Document Number becomes a unique `DRAFT-*` number |
| `POST` | `/api/packages/{id}/duplicate` | Duplicate metadata using a unique `-COPY` Document Number |
| `GET` | `/api/packages/{id}` | Read complete document metadata |
| `GET` | `/api/packages/{id}/workflow-comments` | Read the complete workflow comment snapshot |
| `PATCH` | `/api/packages/{id}` | Update supplied fields |
| `DELETE` | `/api/packages/{id}` | Delete a document |
| `POST` | `/api/packages/reorder` | Persist row ordering |

List parameters: `period=week|month|year|all`, `search`, `discipline`, `document_type`, `transmittal_prefix`, `sort_by`, `sort_order`, `page`, and `page_size`. `transmittal_prefix` performs a starts-with match against the Transmittal Number.

Lifecycle fields accepted by create/update and included in metadata backups are `notes`, `has_attachment`, `is_abandoned`, and `workflow_terminated`. Setting `is_abandoned=true` greys both progress tracks in the UI without deleting their recorded steps.

## Workflow, column settings, and metadata backup

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/settings/columns` | Read Document design and per-register visibility configuration |
| `PUT` | `/api/settings/columns/{field}` | Update Document column labels, width, visibility, and input options |
| `PUT` | `/api/settings/columns/{field}/visibility?register=workflow\|transmittal` | Update visibility only for the selected register |
| `GET` | `/api/settings/workflow` | Read Submission stages, Feedback reviewers, A/B/C/P labels, and Transmittal filter prefixes |
| `PUT` | `/api/settings/workflow` | Update workflow structure, Transmittal prefixes, and remap existing document state by position |
| `GET` | `/api/metadata/export` | Export documents and settings as JSON |
| `POST` | `/api/metadata/import?mode=merge` | Merge a metadata backup |
| `POST` | `/api/metadata/import?mode=replace` | Replace current metadata from a backup |
| `POST` | `/api/metadata/import-csv?mode=merge` | Merge document rows parsed from a CSV file |
| `POST` | `/api/metadata/import-csv?mode=replace` | Replace the document register with CSV rows |

`PUT /api/settings/workflow` requires exactly four unique `submission_steps`, exactly two unique `feedback_reviewers`, labels for all four fixed status codes (`A`, `B`, `C`, `P`), and at least one `transmittal_prefixes` entry. Workflow configuration is included in metadata exports and restores. Legacy `Signature Process` and `Workflow Initiation` names are merged into `Workflow Prepare`.

CSV imports accept a JSON body with `rows` after the browser parses a selected CSV file. The Settings screen supports the same headers emitted by CSV export: `document_number`, `document_date`, `document_type`, `initiator`, `discipline`, `number_of_documents`, `transmittal_number`, `workflow_number`, `workflow_terminated`, `has_attachment`, `is_abandoned`, and `notes`. In merge mode, a matching Document Number updates only columns present in the CSV; new rows receive the active Workflow defaults.

## System

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API and database health check |
