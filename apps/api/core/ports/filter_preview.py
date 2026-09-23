"""Port for counting entities that match a filter preview (tag AND semantics)."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class FilterPreviewSampleItem:
    id: str
    label: str


@dataclass(frozen=True)
class FilterPreviewResult:
    count: int
    sample: list[FilterPreviewSampleItem]


class FilterPreviewPort(Protocol):
    def preview(
        self,
        tenant_id: str,
        target_type: str,
        tag_ids: list[str],
        *,
        sample_limit: int = 5,
    ) -> FilterPreviewResult:
        """Count tenant entities of target_type that have all tag_ids (AND).

        Empty tag_ids means no restriction (all entities of that type in tenant).
        """
        ...
