"""recipe sources

Revision ID: 30c04d06922e
Revises: 6864981063e3
Create Date: 2026-08-17 14:17:50.404721

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30c04d06922e'
down_revision: Union[str, None] = '6864981063e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite can't ALTER a table to add a constraint directly — batch mode
    # does the copy-and-move dance for us.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('source_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('external_id', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('synced_at', sa.DateTime(), nullable=True))
        batch_op.create_unique_constraint('uq_recipe_source_external_id', ['source', 'external_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.drop_constraint('uq_recipe_source_external_id', type_='unique')
        batch_op.drop_column('synced_at')
        batch_op.drop_column('external_id')
        batch_op.drop_column('source_url')
        batch_op.drop_column('source')
