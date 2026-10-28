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

| Frontend owner | Responsibility |
| --- | --- |
| `src/app/AuthProvider.tsx` | Restore the current user, own authentication state, and clear account-specific UI/cache state |
| `src/hooks/useAuth.ts` | Expose the authentication context to components |
| `src/lib/httpClient.ts` | Authenticated HTTP transport, renewal, cookie-operation sequencing and session events |
| `src/lib/api.ts` | Domain API methods and response-error presentation |
| `src/lib/columns.ts` | Shared register column order, labels, visibility, configuration and width descriptors |
| `src/components/packages/PackageTable.tsx` | Coordinate table layout, selection, column order and row order |
| `PackageColumnHeader`, `PackageColumnChooser`, `PackageTableRow` | Own header drag/sort/resize, column controls, and row rendering/actions respectively |

Backend token claims are decoded through `core/security.py::decode_session_token`; `IamService.issue_session` owns session creation. Versioned migrations remain intact even when obsolete runtime code is removed.
