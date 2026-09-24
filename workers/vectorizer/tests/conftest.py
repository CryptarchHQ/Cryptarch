"""Ensure worker package modules are importable when running pytest from repo root."""

from __future__ import annotations

import sys
from pathlib import Path

_WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(_WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(_WORKER_ROOT))
