# DocFlow — Engineering Document Workflow

DocFlow is a maintainable first-version engineering document control system (Based on the Aconex Platform). It uses a React + TypeScript frontend, a FastAPI REST API, MySQL persistence, and Alembic migrations. The UI is designed as an information-dense enterprise workspace rather than an online spreadsheet.

## Features

- Sign-in, roles, and project-scoped access (Administrator, Document Controller, Editor, Viewer), with per-project View only / Role actions
- Dashboard with package and workflow health metrics
- Documents register with This Week (default), This Month, This Year, and All views
- Dedicated Workflow and Transmittal registers with correct default sorting
- Configurable Submission Progress stages (count and names), with optional per-project overrides, and two-reviewer Feedback tracking
- Document Number and document date (day precision) in every package's basic information
- Search, discipline filter, column sorting, CSV export, and drag-to-reorder
- Create/edit modal, package detail drawer, optimistic order updates, and saved MySQL state
- JSON metadata backup/restore with merge and full-replace modes
- CSV document import/export with merge and full-replace modes
- Per-column text/dropdown configuration with custom option lists
- Settings editor for Submission stage names/order, Feedback reviewer names, and A/B/C/P labels
- Categorized Submission Progress, Workflow Feedback, and Comments notifications with unread state
- Personal notification emails (up to 5 per account), project subscriptions including comments, pause/resume, a durable queue, and automatic retries
- API-key-protected endpoints for daily external Workflow and Final Mail comment synchronization
- Click-to-advance Submission progress with equally styled current and following step labels
- Shared draggable Submission slider in document details and editing
- Sequential Feedback Status codes: A/B/C/P for Workflow Reviewer
- Duplicate, abandon/restore, and terminate/reopen actions in each row menu
- Notes and attachment flags with attachment-highlighted rows
- Multi-rule filters across every visible register column
- Loading, empty, error, editing, validation, and success/error feedback states
- Responsive desktop/mobile layout

## Quick start with Docker Compose

1. Copy `.env.example` to `.env` and change all passwords.
2. Run:

   ```bash
   docker compose up --build
   ```

3. Open `http://localhost`. API documentation is available at `http://localhost:8000/api/docs`.

The backend applies Alembic migrations on startup. When `SEED_DEMO_DATA=true`, it inserts twelve sample packages only if the table is empty.

## Local development

MySQL must be running and contain a `docflow` database. Update `DATABASE_URL` as needed.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='mysql+pymysql://docflow:password@localhost:3306/docflow'
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

Frontend (another terminal):

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`. Override this with `VITE_API_URL` when required.

## API

All internal, notification, backup, IAM, and external automation endpoints are documented in [API.md](API.md). Configure `EXTERNAL_API_KEY` and `AUTH_SECRET` before deployment. The first empty database creates `BOOTSTRAP_ADMIN_USERNAME` with `BOOTSTRAP_ADMIN_PASSWORD`. A read-only `guest` account (password `1234567890`) is also created; its password cannot be changed.

## Migrations and tests

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
pytest -q
```

Frontend verification:

```bash
cd frontend
npm run build
```

## Ubuntu VPS deployment

Install Docker Engine and the Docker Compose plugin, clone/copy the project, configure `.env`, then run `docker compose up -d --build`. Put TLS in front of port 80 using Caddy, Nginx, or a managed reverse proxy. Do not expose MySQL port 3306 publicly in production; remove its `ports` entry or restrict it with the VPS firewall. Back up the `mysql_data` volume regularly.

See [API.md](API.md) for every endpoint and [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the code map.

## Project access and email setup

Notifications default to English for interface copy, generated titles and email templates. Comments and document content retain their original language.

In **Settings → Users & access**, choose the user's roles and project scope. For each assigned project choose **View only** or **Role actions**. Viewer can read project records and manage its own notification emails; Administrator always has full access. Other roles can have mixed access, such as NFS view only and FST editable. View-only users can read workflow comments. Workspace settings/imports are unavailable if any project is read-only.

In the left sidebar, open **Notification → Email addresses**. Every account can manage up to **5 distinct addresses** of its own, including view-only accounts. Choose the project and update types. Reuse an address for another project without consuming an extra slot. Paused addresses count towards the limit; remove all project subscriptions under an address to free its slot. Recipients do not need DocFlow accounts. Document updates, progress, feedback, and comment changes are supported; emails include the current comments. Identical synchronization snapshots do not send repeats. Bulk register imports send one summary per project.

To enable outgoing email, an administrator must configure one sending mailbox on the server, separate from each account's recipient subscriptions. Open **Notification → Email addresses → How to set up the sending mailbox** for the English in-app instructions, or follow [EMAIL_SETUP.md](EMAIL_SETUP.md) for the complete English setup guide, Gmail example and troubleshooting.

Add or update `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_EMAIL`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_SECURITY` in the deployed project's existing `.env`, preserving its database/account configuration. `.env.example` is a reference only. Use `starttls` with port 587 or `ssl` with port 465 as required by your provider; the current transport supports SMTP username/password or a trusted unauthenticated relay, not OAuth. Set `PUBLIC_APP_URL` to include document links, then run `docker compose up -d --force-recreate backend` in that deployment directory. A simple Docker restart does not reload environment variables. Use `docker compose up -d --build` when installing updated application code. With no mail configuration, subscriptions and queued changes are still saved. After configuration, valid queued email is processed automatically. The setup notice only checks that a hostname and sender are present; test actual delivery to your own mailbox before adding project recipients.

Migration `20261009_26` adds project read-only overrides and email subscription/outbox tables; `20261009_27` makes subscriptions personal to their account owner. Docker startup applies the migrations and refreshes the role catalog. Local development must run `alembic upgrade head` and `python -m app.seed` before starting the API. SMTP failure cannot roll back the document change; failed delivery can be retried in Notification.

View-only browsing shows **Dashboard, Documents and Notification** only. Workflow/Transmittal/Settings direct links return to Documents. The interface follows the selected project for accounts with mixed access. Document Number is retained in all register tables. The Docs (document count) column is absent from register tables and column settings; detail/edit forms, exports and stored counts retain it.
