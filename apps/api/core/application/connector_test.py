"""Probe connector auth configuration without exposing secrets."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from core.domain.models import Connector
from core.ports.connector_repository import ConnectorRepository

PROBE_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class ConnectorAuthTestResult:
    ok: bool
    detail: str


class _MissingEnvVar(Exception):
    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(name)


def _env_value(name: str | None, environ: Mapping[str, str]) -> str:
    if not name or not isinstance(name, str) or not name.strip():
        raise _MissingEnvVar(name or "")
    key = name.strip()
    if key not in environ or environ[key] == "":
        raise _MissingEnvVar(key)
    return environ[key]


def _sanitize_detail(detail: str, secrets: list[str]) -> str:
    out = detail
    for secret in secrets:
        if secret and secret in out:
            out = out.replace(secret, "***")
    return out


def _build_request(
    connector: Connector,
    environ: Mapping[str, str],
) -> tuple[
    str, str, dict[str, str], dict[str, Any] | None, tuple[str, str] | None, list[str]
]:
    """Return method, url, headers, form data, basic auth, secrets used."""
    auth_config = connector.auth_config
    secrets: list[str] = []
    headers: dict[str, str] = {}
    data: dict[str, Any] | None = None
    basic: tuple[str, str] | None = None

    if not auth_config:
        return "GET", connector.base_url, headers, None, None, secrets

    auth_type = auth_config.get("type")

    if auth_type == "bearer":
        token = _env_value(auth_config.get("token_env"), environ)
        secrets.append(token)
        headers["Authorization"] = f"Bearer {token}"
        return "GET", connector.base_url, headers, None, None, secrets

    if auth_type == "api_key":
        key = _env_value(auth_config.get("key_env"), environ)
        secrets.append(key)
        header_name = auth_config.get("header_name") or "X-API-Key"
        headers[str(header_name)] = key
        return "GET", connector.base_url, headers, None, None, secrets

    if auth_type == "basic":
        password = _env_value(auth_config.get("password_env"), environ)
        secrets.append(password)
        username = str(auth_config.get("username") or "")
        basic = (username, password)
        return "GET", connector.base_url, headers, None, basic, secrets

    if auth_type == "oauth2":
        token_url = auth_config.get("token_url")
        if not token_url or not isinstance(token_url, str) or not token_url.strip():
            raise ValueError("Missing token_url in oauth2 auth_config")
        client_secret = _env_value(auth_config.get("client_secret_env"), environ)
        secrets.append(client_secret)
        data = {
            "grant_type": "client_credentials",
            "client_id": str(auth_config.get("client_id") or ""),
            "client_secret": client_secret,
        }
        scope = auth_config.get("scope")
        if scope:
            data["scope"] = str(scope)
        return "POST", token_url.strip(), headers, data, None, secrets

    # custom / unknown: probe base_url without injecting credentials
    return "GET", connector.base_url, headers, None, None, secrets


def _probe(
    method: str,
    url: str,
    headers: dict[str, str],
    data: dict[str, Any] | None,
    basic: tuple[str, str] | None,
    secrets: list[str],
) -> ConnectorAuthTestResult:
    try:
        with httpx.Client(
            timeout=PROBE_TIMEOUT_SECONDS, follow_redirects=False
        ) as client:
            response = client.request(
                method,
                url,
                headers=headers,
                data=data,
                auth=basic,
            )
    except httpx.TimeoutException:
        return ConnectorAuthTestResult(
            ok=False,
            detail=_sanitize_detail("Request timed out", secrets),
        )
    except httpx.HTTPError as exc:
        return ConnectorAuthTestResult(
            ok=False,
            detail=_sanitize_detail(
                f"Network error: {exc.__class__.__name__}", secrets
            ),
        )

    # Any HTTP response (including 4xx) means the service was reached.
    return ConnectorAuthTestResult(
        ok=True,
        detail=_sanitize_detail(
            f"Reached remote service (HTTP {response.status_code})",
            secrets,
        ),
    )


def test_connector_auth(
    connector_id: str,
    tenant_id: str,
    repo: ConnectorRepository,
    environ: Mapping[str, str] | None = None,
) -> ConnectorAuthTestResult | None:
    """Probe connector auth. None if connector not found in tenant."""
    connector = repo.get_by_id(connector_id, tenant_id)
    if connector is None:
        return None

    env = environ if environ is not None else os.environ

    try:
        method, url, headers, data, basic, secrets = _build_request(connector, env)
    except _MissingEnvVar as exc:
        name = exc.name or "unknown"
        return ConnectorAuthTestResult(
            ok=False,
            detail=f"Missing environment variable: {name}",
        )
    except ValueError as exc:
        return ConnectorAuthTestResult(ok=False, detail=str(exc))

    return _probe(method, url, headers, data, basic, secrets)
