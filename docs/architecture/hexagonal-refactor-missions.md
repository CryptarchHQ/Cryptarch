# Misiones por agregado — Refactor hexagonal API

Cada **sub-worker (ai-worker)** recibe una misión para un solo agregado. Solo toca los ficheros listados. La fuente de verdad de estructura y reglas: `docs/architecture/api-architecture-decision.md`.

## Convenciones comunes

- **Routers (driving)**: validar con schemas, llamar a un caso de uso en `core.application`, devolver schema. No acceder a BD ni conocer repos concretos.
- **Casos de uso**: reciben los **ports** por inyección (ej. `UserRepository`); no importan `adapters.driven`.
- **Repos (driven)**: implementan interfaces de `core.ports`, usan `Session` y modelos de `core.domain.models`.
- **Tenant**: siempre de `current_user.tenant_id` en driving; el core recibe `tenant_id: str`.
- **UUID**: aceptar hex 32 chars y canonical (con guiones); normalizar a canonical en respuestas.

Referencia de código actual: `admin/routes.py` y `auth/routes.py` (lógica a extraer).

---

## 1. User

**Ficheros que toca solo este worker:**
- `core/application/user.py` — list_by_tenant, get_by_id, create, update, delete (reciben UserRepository y opcionalmente PasswordHasher para create/update).
- `adapters/driven/persistence/user_repository.py` — implementa `core.ports.user_repository.UserRepository` con Session y `core.domain.models.User`.
- `adapters/driving/schemas/user.py` — UserCreateBody, UserUpdateBody, user_to_response (o schema Pydantic para respuesta).
- `adapters/driving/http/admin/routes_users.py` — router con prefix `/admin`, endpoints GET/POST/PATCH/DELETE `/users` y `/users/{user_id}`. Depends(get_db), require_admin; inyectar repo desde session; llamar a application.user.*

Port: `core/ports/user_repository.py` (ya existe).

---

## 2. Tag

**Ficheros:**
- `core/application/tag.py` — list_by_tenant, get_by_id, create, update, delete (reciben TagRepository).
- `adapters/driven/persistence/tag_repository.py` — implementa `core.ports.tag_repository.TagRepository`.
- `adapters/driving/schemas/tag.py` — TagCreateBody, TagUpdateBody, tag_to_response.
- `adapters/driving/http/admin/routes_tags.py` — endpoints `/admin/tags` y `/admin/tags/{tag_id}`.

Port: `core/ports/tag_repository.py` (ya existe).

---

## 3. SavedFilter

**Ficheros:**
- `core/application/saved_filter.py` — list, get, create, update, delete (SavedFilterRepository; validar tag_ids en tenant en app o en repo).
- `adapters/driven/persistence/saved_filter_repository.py` — implementa `core.ports.saved_filter_repository.SavedFilterRepository` (incl. SavedFilterTag).
- `adapters/driving/schemas/saved_filter.py` — FilterCreateBody, FilterUpdateBody, filter_to_response (con tag_ids).
- `adapters/driving/http/admin/routes_filters.py` — endpoints `/admin/filters` y `/admin/filters/{filter_id}`; `POST /admin/filters/preview`.

Port: `core/ports/saved_filter_repository.py` (ya existe).

---

## 4. Group

**Ficheros:**
- `core/application/group.py` — list, get, create, update, delete (GroupRepository; validar saved filter ids en tenant).
- `adapters/driven/persistence/group_repository.py` — implementa `core.ports.group_repository.GroupRepository` (incl. GroupUserFilter, GroupActionFilter, GroupDocumentFilter).
- `adapters/driving/schemas/group.py` — GroupCreateBody, GroupUpdateBody, group_to_response (user_filter_ids, action_filter_ids, document_filter_ids).
- `adapters/driving/http/admin/routes_groups.py` — endpoints `/admin/groups` y `/admin/groups/{group_id}`.

Port: `core/ports/group_repository.py` (ya existe).

---

## 5. Connector

**Ficheros:**
- `core/application/connector.py` — list, get, create, update, delete (ConnectorRepository; delete comprobar has_actions → 409).
- `core/application/connector_probe.py` — probe_connector_auth (http/https only; no secrets in result).
- `adapters/driven/persistence/connector_repository.py` — implementa `core.ports.connector_repository.ConnectorRepository`.
- `adapters/driving/schemas/connector.py` — ConnectorCreateBody, ConnectorUpdateBody, connector_to_response.
- `adapters/driving/http/admin/routes_connectors.py` — endpoints `/admin/connectors`, `/admin/connectors/{connector_id}`, `POST /admin/connectors/{id}/test`.

Port: `core.ports/connector_repository.py` (ya existe).

---

## 6. Action

**Ficheros:**
- `core/application/action.py` — list (opcional connector_id), get, create, update, delete (ActionRepository + validar connector y tag_ids en tenant).
- `adapters/driven/persistence/action_repository.py` — implementa `core.ports.action_repository.ActionRepository` (incl. ActionTag).
- `adapters/driving/schemas/action.py` — ActionCreateBody, ActionUpdateBody, action_to_response (tag_ids).
- `adapters/driving/http/admin/routes_actions.py` — endpoints `/admin/actions` y `/admin/actions/{action_id}` (query opcional connector_id).

Port: `core/ports/action_repository.py` (ya existe). Depende de ConnectorRepository para validar connector_id en create.

---

## 7. Document

**Ficheros:**
- `core/application/document.py` — list, get, create, update, delete, upload, retry (DocumentRepository; validar tag_ids en tenant).
- `adapters/driven/persistence/document_repository.py` — implementa `core.ports.document_repository.DocumentRepository` (incl. DocumentTag).
- `adapters/driving/schemas/document.py` — DocumentCreateBody, DocumentUpdateBody, document_to_response (tag_ids).
- `adapters/driving/http/admin/routes_documents.py` — endpoints `/admin/documents`, `/admin/documents/{document_id}`, `POST /admin/documents/upload`, `POST /admin/documents/{id}/retry`.

Port: `core/ports/document_repository.py` (ya existe).

---

## 8. Auth

**Ficheros:**
- `core/application/auth.py` — login(tenant_id, email, password) → User o None; usa UserRepository + PasswordHasher (verify).
- `adapters/driven/persistence/password_hasher.py` — implementa `core.ports.password_hasher.PasswordHasher` (bcrypt).
- `adapters/driving/schemas/auth.py` — LoginBody, TokenResponse.
- `adapters/driving/http/auth/routes.py` — POST /auth/login, POST /auth/logout; llamar a application.auth; crear JWT en driving (config JWT_SECRET/JWT_ALGORITHM).

Ports: `core/ports/user_repository.py`, `core/ports/password_hasher.py` (ya existen).

---

## 9. Master (orquestador o último worker)

**Ficheros:**
- `adapters/driving/http/admin/__init__.py` — opcional.
- `adapters/driving/http/admin/routes.py` — **único** router admin que incluye: routes_users, routes_tags, routes_filters, routes_groups, routes_connectors, routes_actions, routes_documents; y endpoint GET /admin/me (current user info).
- `GET /me` (no `/admin/me`) — perfil de sesión para cualquier autenticado (email, tenant_name, role, sub).
- `main.py` — importar router admin desde `adapters.driving.http.admin.routes`, router auth desde `adapters.driving.http.auth.routes`; incluir ambos; health en main.
- `dependencies.py` — si hace falta: factories `get_user_repository(db)`, etc., o un único provider de repos para inyectar en routers. get_db ya viene de `adapters.driven.persistence.db`.

No borrar aún `admin/routes.py` ni `auth/routes.py` hasta que tests pasen con la nueva estructura.
