"""document_original_filename_and_uploaded_at

Revision ID: 007
Revises: 006
Create Date: Persist client original filename and upload timestamp on documents (issue #54).

Nullable for existing rows; upload path sets both on new uploads.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: str | Sequence[str] | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("original_filename", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "uploaded_at")
    op.drop_column("documents", "original_filename")
