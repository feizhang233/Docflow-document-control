# Project structure

```text
.
├── frontend/                 React + TypeScript single-page application
│   ├── src/app/              Routes and application composition
│   ├── src/components/       Layout, shared UI, package table/editor/drawer
│   ├── src/lib/              API client, auth transport, and project helpers
│   ├── src/hooks/            Auth session, projects, and UI behavior hooks
│   ├── src/pages/            Dashboard, registers, settings, and login screens
│   ├── src/styles/           Design system and responsive application CSS
│   ├── src/types/            Shared frontend domain types
│   ├── Dockerfile            Production frontend image
│   └── nginx.conf            SPA and `/api` reverse-proxy configuration
├── backend/                  FastAPI service
│   ├── alembic/              Versioned MySQL schema migrations
│   ├── app/api/              HTTP route layer
│   ├── app/core/             Environment, JWT cookies, and permission catalog
│   ├── app/db/               SQLAlchemy base and session lifecycle
│   ├── app/models/           SQLAlchemy persistence models
│   ├── app/repositories/     Database queries and persistence operations
│   ├── app/schemas/          Pydantic request/response contracts
│   ├── app/services/         Package, settings, import/export business rules
│   ├── app/seed.py           Idempotent demo data loader
│   └── tests/                API and persistence behavior tests
├── docker-compose.yml        MySQL, backend, and frontend orchestration
├── .env.example              Deployment configuration template
├── API.md                    Unified internal and external API reference
└── README.md                 Setup, API, testing, and VPS deployment guide
```

Routes stay thin; service classes own business behavior and repositories own queries. Column input settings, workflow structure, and metadata backups are stored in MySQL and versioned through Alembic. Future external systems should be added through dedicated adapters and invoked by a worker or scheduler rather than added to HTTP route files.
