"""Backfill helper for Connector.name from base_url (C-29 / issue #29)."""

from core.domain.connector_defaults import default_connector_name


def test_default_connector_name_uses_host_from_https_url():
    assert default_connector_name("https://api.example.com/v1") == "api.example.com"


def test_default_connector_name_uses_host_from_http_url_with_port():
    assert default_connector_name("http://localhost:8080/path") == "localhost"


def test_default_connector_name_fallback_when_host_missing():
    assert default_connector_name("") == "Conector"
    assert default_connector_name("   ") == "Conector"
    assert default_connector_name("not-a-url") == "Conector"
    assert default_connector_name("/relative/path") == "Conector"
