"""Unit tests for action request_config validation (method vs body, legacy aliases)."""

import pytest
from core.domain.action_request_config import (
    RequestConfigValidationError,
    normalize_request_config_shape,
    validate_and_normalize_request_config,
)


def test_get_without_body_ok():
    assert validate_and_normalize_request_config("GET", None) is None
    assert validate_and_normalize_request_config("GET", {"timeout": 30}) == {
        "timeout": 30
    }
    assert validate_and_normalize_request_config(
        "GET", {"headers": {"X-Foo": "bar"}}
    ) == {"headers": {"X-Foo": "bar"}}


def test_get_with_body_rejected():
    with pytest.raises(RequestConfigValidationError, match="body"):
        validate_and_normalize_request_config("GET", {"body": {"k": 1}})


def test_delete_with_body_rejected():
    with pytest.raises(RequestConfigValidationError):
        validate_and_normalize_request_config("DELETE", {"body": []})


def test_post_put_patch_allow_body():
    cfg = {"body": {"a": 1}, "query": {"q": "x"}}
    assert validate_and_normalize_request_config("POST", cfg) == cfg
    assert validate_and_normalize_request_config("put", cfg) == cfg
    assert validate_and_normalize_request_config("PATCH", cfg) == cfg


def test_invalid_payload_not_object():
    with pytest.raises(RequestConfigValidationError, match="object"):
        validate_and_normalize_request_config("POST", "nope")  # type: ignore[arg-type]


def test_legacy_query_params_mapped_to_query():
    assert validate_and_normalize_request_config(
        "GET", {"query_params": {"page": "1"}}
    ) == {"query": {"page": "1"}}


def test_legacy_body_params_mapped_to_body():
    assert validate_and_normalize_request_config(
        "POST", {"body_params": {"name": "{{title}}"}}
    ) == {"body": {"name": "{{title}}"}}


def test_legacy_keys_removed_from_normalized_output():
    out = validate_and_normalize_request_config(
        "POST",
        {
            "headers": {"X": "1"},
            "query_params": {"q": "a"},
            "body_params": {"b": 2},
            "timeout": 5,
        },
    )
    assert out == {
        "headers": {"X": "1"},
        "query": {"q": "a"},
        "body": {"b": 2},
        "timeout": 5,
    }
    assert "query_params" not in out
    assert "body_params" not in out


def test_canonical_wins_over_legacy_when_both_present():
    out = validate_and_normalize_request_config(
        "POST",
        {
            "query": {"canonical": True},
            "query_params": {"legacy": True},
            "body": {"c": 1},
            "body_params": {"l": 2},
        },
    )
    assert out == {"query": {"canonical": True}, "body": {"c": 1}}
    assert "query_params" not in out
    assert "body_params" not in out


def test_get_rejects_legacy_body_params():
    with pytest.raises(RequestConfigValidationError, match="body"):
        validate_and_normalize_request_config(
            "GET", {"body_params": {"k": 1}}
        )


def test_delete_rejects_legacy_body_params():
    with pytest.raises(RequestConfigValidationError, match="body"):
        validate_and_normalize_request_config(
            "DELETE", {"body_params": {"k": 1}}
        )


def test_canonical_optional_fields_preserved():
    cfg = {
        "headers": {"H": "v"},
        "query": {"q": "1"},
        "body": {"a": 1},
        "auth": {"type": "bearer"},
        "content_type": "application/json",
        "timeout": 30,
    }
    assert validate_and_normalize_request_config("POST", cfg) == cfg


def test_normalize_shape_for_read_drops_legacy_keys():
    """API read path: remap without method/body enforcement."""
    assert normalize_request_config_shape(
        {"query_params": {"x": 1}, "body_params": {"y": 2}, "timeout": 1}
    ) == {"query": {"x": 1}, "body": {"y": 2}, "timeout": 1}
    assert normalize_request_config_shape(None) is None
