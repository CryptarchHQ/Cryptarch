"""Document status updates for the vectorizer worker."""

from __future__ import annotations

from typing import Protocol


def normalize_document_id(document_id: str) -> str:
    """Strip hyphens so UUID comparisons work with or without dashes."""
    return document_id.replace("-", "").lower()


class StatusStore(Protocol):
    def set_status(self, document_id: str, status: str) -> None:
        """Update documents.status for the given id. Never delete rows."""
        ...


class PostgresStatusStore:
    """Updates ``documents.status`` via DATABASE_URL (psycopg)."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def set_status(self, document_id: str, status: str) -> None:
        import psycopg

        normalized = normalize_document_id(document_id)
        with psycopg.connect(self._database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE documents
                    SET status = %s
                    WHERE replace(id::text, '-', '') = %s
                    """,
                    (status, normalized),
                )
            conn.commit()
