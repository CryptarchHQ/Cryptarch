# Domain Model

## Core rule
Tags are metadata only. Permissions come from saved filters and group bindings.

## Entities
- Tag (flat labels in phase 1)
- SavedFilter (target: user/action/document, tag AND logic)
- Group (binds user/action/document saved filters)
- User (role: admin or user; tagged; tenant-scoped)
- Connector (required name, optional description, base URL + auth config; transitional semantic alias: Integration)
- Action (belongs to connector; method/path/request config; tagged; transitional semantic alias: IntegrationAction)
  - Canonical `request_config`: `headers`, `query`, `body`; optional `auth`, `content_type`, `timeout`. Aliases `query_params` / `body_params` are accepted and stored as `query` / `body`.
- Document (tenant file metadata; tagged; indexing status)
  - Upload accepts PDF/TXT/CSV; initial status `queued`; Redis queue `cryptarch:document_jobs`; retry only from `error`. JSON POST for metadata still exists.

## Session profile
- `GET /me`: email, tenant_name, role and sub for any authenticated user.
- `GET /admin/me`: admin-only (`sub`, `tenant_id`, `role`).

## Filters preview
- `POST /admin/filters/preview`: counts tenant entities that have ALL requested tags.

## Effective permissions
1. Find groups whose user filters match the user
2. Union actions from those groups' action filters
3. Union documents from those groups' document filters

## Multi-tenant rule
Every structured entity is tenant-scoped (`tenant_id`), and tenant filters are applied before permission filters.

## Future optimization
If joins get expensive, add precomputed permission tables recalculated on admin changes.
