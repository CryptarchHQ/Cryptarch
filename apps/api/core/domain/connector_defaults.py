"""Defaults for Connector identity fields (C-29)."""

from urllib.parse import urlparse

_FALLBACK_NAME = "Conector"


def default_connector_name(base_url: str | None) -> str:
    """Derive a non-empty display name from base_url host, or fallback."""
    if not base_url or not isinstance(base_url, str):
        return _FALLBACK_NAME
    host = (urlparse(base_url.strip()).hostname or "").strip()
    if host:
        return host
    return _FALLBACK_NAME
