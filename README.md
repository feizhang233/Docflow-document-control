# DocFlow — Engineering Document Workflow

DocFlow is a maintainable first-version engineering document control system (Based on the Aconex Platform). It uses a React + TypeScript frontend, a FastAPI REST API, MySQL persistence, and Alembic migrations. The UI is designed as an information-dense enterprise workspace rather than an online spreadsheet.

## Features

- Sign-in, roles, and project-scoped access (Administrator, Document Controller, Editor, Viewer)
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
- Categorized Submission Progress and Workflow Feedback notifications with unread state
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

All internal, notification, backup, IAM, and external automation endpoints are documented in [API.md](API.md). Configure `EXTERNAL_API_KEY` and `AUTH_SECRET` before deployment. The first empty database creates `BOOTSTRAP_ADMIN_USERNAME` with `BOOTSTRAP_ADMIN_PASSWORD`.

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
