"""Tests for document job processing (no real Redis/Postgres)."""

from __future__ import annotations

import json
from pathlib import Path

import redis
from pypdf import PdfWriter

from job_processor import (
    STATUS_ERROR,
    STATUS_INDEXED,
    STATUS_PROCESSING,
    process_job,
    process_raw_payload,
)
from worker import pop_job


class FakeStatusStore:
    def __init__(self) -> None:
        self.transitions: list[tuple[str, str]] = []
        self.by_id: dict[str, str] = {}

    def set_status(self, document_id: str, status: str) -> None:
        self.transitions.append((document_id, status))
        self.by_id[document_id] = status


def _job(document_id: str, file_path: str, tenant_id: str = "tenant-1") -> dict:
    return {
        "document_id": document_id,
        "tenant_id": tenant_id,
        "file_path": file_path,
    }


def test_txt_with_text_ends_indexed_and_passes_through_processing(
    tmp_path: Path,
) -> None:
    path = tmp_path / "doc.txt"
    path.write_text("hola mundo", encoding="utf-8")
    store = FakeStatusStore()
    doc_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

    process_job(_job(doc_id, str(path)), store)

    assert [s for _, s in store.transitions] == [STATUS_PROCESSING, STATUS_INDEXED]
    assert store.by_id[doc_id] == STATUS_INDEXED


def test_csv_with_text_ends_indexed(tmp_path: Path) -> None:
    path = tmp_path / "data.csv"
    path.write_text("a,b\n1,2\n", encoding="utf-8")
    store = FakeStatusStore()
    doc_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    process_job(_job(doc_id, str(path)), store)

    assert store.by_id[doc_id] == STATUS_INDEXED
    assert STATUS_PROCESSING in [s for _, s in store.transitions]


def test_empty_txt_ends_error_not_indexed(tmp_path: Path) -> None:
    path = tmp_path / "empty.txt"
    path.write_text("   \n", encoding="utf-8")
    store = FakeStatusStore()
    doc_id = "cccccccccccccccccccccccccccccccc"

    process_job(_job(doc_id, str(path)), store)

    assert store.by_id[doc_id] == STATUS_ERROR
    assert STATUS_INDEXED not in [s for _, s in store.transitions]
    assert store.transitions[0] == (doc_id, STATUS_PROCESSING)


def test_empty_pdf_ends_error_not_indexed(tmp_path: Path) -> None:
    path = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with path.open("wb") as fh:
        writer.write(fh)

    store = FakeStatusStore()
    doc_id = "dddddddddddddddddddddddddddddddd"

    process_job(_job(doc_id, str(path)), store)

    assert store.by_id[doc_id] == STATUS_ERROR
    assert STATUS_INDEXED not in [s for _, s in store.transitions]


def test_missing_file_ends_error_not_indexed(tmp_path: Path) -> None:
    path = tmp_path / "missing.txt"
    store = FakeStatusStore()
    doc_id = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

    process_job(_job(doc_id, str(path)), store)

    assert store.by_id[doc_id] == STATUS_ERROR
    assert STATUS_INDEXED not in [s for _, s in store.transitions]


def test_unsupported_extension_ends_error(tmp_path: Path) -> None:
    path = tmp_path / "img.png"
    path.write_bytes(b"\x89PNG")
    store = FakeStatusStore()
    doc_id = "ffffffffffffffffffffffffffffffff"

    process_job(_job(doc_id, str(path)), store)

    assert store.by_id[doc_id] == STATUS_ERROR


def test_reprocess_is_idempotent_processing_then_indexed(tmp_path: Path) -> None:
    path = tmp_path / "again.txt"
    path.write_text("contenido", encoding="utf-8")
    store = FakeStatusStore()
    doc_id = "11111111111111111111111111111111"
    job = _job(doc_id, str(path))

    process_job(job, store)
    process_job(job, store)

    assert [s for _, s in store.transitions] == [
        STATUS_PROCESSING,
        STATUS_INDEXED,
        STATUS_PROCESSING,
        STATUS_INDEXED,
    ]
    assert store.by_id[doc_id] == STATUS_INDEXED


def test_malformed_job_does_not_raise() -> None:
    store = FakeStatusStore()

    process_raw_payload("not-json", store)
    process_raw_payload(b'{"document_id": "x"}', store)  # missing keys
    process_raw_payload(json.dumps([1, 2, 3]), store)

    assert store.transitions == []


def test_process_raw_payload_bytes_success(tmp_path: Path) -> None:
    path = tmp_path / "ok.txt"
    path.write_text("ok", encoding="utf-8")
    store = FakeStatusStore()
    doc_id = "22222222222222222222222222222222"
    raw = json.dumps(_job(doc_id, str(path))).encode("utf-8")

    process_raw_payload(raw, store)

    assert store.by_id[doc_id] == STATUS_INDEXED


class _TimeoutRedis:
    def blpop(self, queue_name, timeout):
        raise redis.TimeoutError("Timeout reading from socket")


def test_pop_job_treats_socket_timeout_as_empty_queue() -> None:
    assert pop_job(_TimeoutRedis(), "cryptarch:document_jobs", 5) is None
