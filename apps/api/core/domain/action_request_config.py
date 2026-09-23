"""Request builder config for HTTP actions: shape validation and method/body rules."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

NO_REQUEST_BODY_METHODS = frozenset({"GET", "DELETE"})

_LEGACY_QUERY_KEY = "query_params"
_LEGACY_BODY_KEY = "body_params"


class RequestConfigValidationError(ValueError):
    """request_config is not a valid request builder payload for the given method."""


class ActionRequestConfigPayload(BaseModel):
    """Known fields for the admin request builder; unknown keys are kept for backward compatibility.

    Canonical keys: headers, query, body, and optionally auth, content_type, timeout.
    Legacy aliases query_params / body_params are remapped before validation.
    """

    model_config = ConfigDict(extra="allow")

    headers: dict[str, Any] | None = None
    query: dict[str, Any] | None = None
    body: Any | None = None


def _apply_legacy_aliases(raw: dict[str, Any]) -> dict[str, Any]:
    """Map query_params→query and body_params→body; always drop legacy keys.

    If both canonical and legacy keys are present, the canonical value wins.
    """
    out = dict(raw)
    if _LEGACY_QUERY_KEY in out:
        if "query" not in out:
            out["query"] = out[_LEGACY_QUERY_KEY]
        del out[_LEGACY_QUERY_KEY]
    if _LEGACY_BODY_KEY in out:
        if "body" not in out:
            out["body"] = out[_LEGACY_BODY_KEY]
        del out[_LEGACY_BODY_KEY]
    return out


def normalize_request_config_shape(
    raw: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Remap legacy aliases and dump the payload shape (no method/body rules).

    Used when serializing stored request_config so API responses never expose
    ``query_params`` / ``body_params``.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise RequestConfigValidationError("request_config must be a JSON object")
    try:
        parsed = ActionRequestConfigPayload.model_validate(_apply_legacy_aliases(raw))
    except Exception as exc:
        raise RequestConfigValidationError(str(exc)) from exc
    dumped = dict(parsed.model_dump(mode="python", exclude_none=True))
    return dumped if dumped else None


def validate_and_normalize_request_config(
    method: str,
    raw: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Parse request_config, enforce GET/DELETE have no body, return a normalized dict for persistence.

    Legacy blobs (e.g. only ``timeout``) remain valid as long as ``body`` is absent/None.
    Legacy ``query_params`` / ``body_params`` are remapped to ``query`` / ``body`` and removed.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise RequestConfigValidationError("request_config must be a JSON object")

    m = (method or "").strip().upper()
    dumped = normalize_request_config_shape(raw)
    if dumped is None:
        return None

    if m in NO_REQUEST_BODY_METHODS and "body" in dumped and dumped["body"] is not None:
        raise RequestConfigValidationError(
            "request_config.body is not allowed for GET or DELETE actions"
        )

    return dumped
