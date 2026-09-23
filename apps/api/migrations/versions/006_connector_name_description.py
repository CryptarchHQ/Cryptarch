"""connector_name_and_description

Revision ID: 006
Revises: 005
Create Date: Add required name and optional description to connectors (C-29).

Backfill: name from base_url host, or "Conector"; description stays null.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from core.domain.connector_defaults import default_connector_name

revision: str = "006"
down_revision: str | Sequence[str] | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("connectors", sa.Column("name", sa.String(length=255), nullable=True))
    op.add_column("connectors", sa.Column("description", sa.Text(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, base_url FROM connectors")).mappings()
    for row in rows:
        connection.execute(
            sa.text("UPDATE connectors SET name = :name WHERE id = :id"),
            {"name": default_connector_name(row["base_url"]), "id": row["id"]},
        )

    op.alter_column("connectors", "name", existing_type=sa.String(255), nullable=False)


def downgrade() -> None:
    op.drop_column("connectors", "description")
    op.drop_column("connectors", "name")
