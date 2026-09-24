"""Text extraction for document ingestion (phase 1: no OCR).

Supported: .txt, .csv (UTF-8), .pdf (pypdf text layer only).
"""

from __future__ import annotations

from pathlib import Path

SUPPORTED_EXTENSIONS = frozenset({".txt", ".csv", ".pdf"})


class ExtractionError(Exception):
    """Raised when a file cannot be read or yields no usable text."""


def extract_text(file_path: str) -> str:
    """Extract plain text from *file_path*.

    Returns non-empty stripped text on success.
    Raises ExtractionError for missing file, unsupported type, empty text, or I/O errors.
    """
    path = Path(file_path)
    if not path.is_file():
        raise ExtractionError(f"file not found: {file_path}")

    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ExtractionError(f"unsupported extension: {suffix or '(none)'}")

    try:
        if suffix in {".txt", ".csv"}:
            text = path.read_text(encoding="utf-8")
        else:
            text = _extract_pdf_text(path)
    except ExtractionError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any read/parse failure
        raise ExtractionError(f"failed to read {file_path}: {exc}") from exc

    if not text or not text.strip():
        raise ExtractionError(f"no extractable text in {file_path}")

    return text


def _extract_pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        parts.append(page_text)
    return "\n".join(parts)
