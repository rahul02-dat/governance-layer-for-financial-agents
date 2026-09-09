"""Add execution authorizations and indexes
Revision ID: f318bc991a01
Revises: d270af37167d
Create Date: 2026-09-09 13:16:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f318bc991a01'
down_revision: Union[str, None] = 'd270af37167d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Execution authorizations table
    if 'execution_authorizations' not in tables:
        op.create_table(
            'execution_authorizations',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('agent_id', sa.String(), nullable=False),
            sa.Column('action', sa.String(), nullable=False),
            sa.Column('resource_type', sa.String(), nullable=False),
            sa.Column('resource_id', sa.String(), nullable=False),
            sa.Column('amount', sa.Numeric(18, 2), nullable=False),
            sa.Column('currency', sa.String(), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default="ISSUED"),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index('ix_exec_auth_agent_id', 'execution_authorizations', ['agent_id'])
        op.create_index('ix_exec_auth_status', 'execution_authorizations', ['status'])

    # 2. Audit event sequence number and indexes
    if 'audit_events' in tables:
        audit_cols = [c['name'] for c in inspector.get_columns('audit_events')]
        if 'sequence_number' not in audit_cols:
            op.add_column('audit_events', sa.Column('sequence_number', sa.Integer(), nullable=True))
        
        audit_indices = [idx['name'] for idx in inspector.get_indexes('audit_events')]
        for idx_name, col_name in [
            ('ix_audit_events_request_id', 'request_id'),
            ('ix_audit_events_auth_id', 'authorization_id'),
            ('ix_audit_events_timestamp', 'timestamp'),
            ('ix_audit_events_agent_id', 'agent_id'),
            ('ix_audit_events_decision', 'decision'),
            ('ix_audit_events_reason', 'reason'),
            ('ix_audit_events_sequence_number', 'sequence_number'),
        ]:
            if idx_name not in audit_indices:
                op.create_index(idx_name, 'audit_events', [col_name])

    # 3. Audit chain head table & last_sequence_number
    if 'audit_chain_head' not in tables:
        op.create_table(
            'audit_chain_head',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('last_event_id', sa.String(), nullable=True),
            sa.Column('last_event_hash', sa.String(), nullable=True),
            sa.Column('last_sequence_number', sa.Integer(), nullable=True, server_default='0'),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        head_cols = [c['name'] for c in inspector.get_columns('audit_chain_head')]
        if 'last_sequence_number' not in head_cols:
            op.add_column('audit_chain_head', sa.Column('last_sequence_number', sa.Integer(), nullable=True, server_default='0'))

    # 4. Approval request indexes
    if 'approval_requests' in tables:
        appr_indices = [idx['name'] for idx in inspector.get_indexes('approval_requests')]
        if 'ix_approval_status' not in appr_indices:
            op.create_index('ix_approval_status', 'approval_requests', ['status'])
        if 'ix_approval_request_id' not in appr_indices:
            op.create_index('ix_approval_request_id', 'approval_requests', ['request_id'])

    # 5. Policy version constraint and index
    if 'policy_versions' in tables:
        pv_indices = [idx['name'] for idx in inspector.get_indexes('policy_versions')]
        if 'ix_policy_version_policy_id' not in pv_indices:
            op.create_index('ix_policy_version_policy_id', 'policy_versions', ['policy_id'])
        try:
            op.create_unique_constraint('uq_policy_version', 'policy_versions', ['policy_id', 'version_number'])
        except Exception:
            pass

def downgrade() -> None:
    op.drop_index('ix_policy_version_policy_id', table_name='policy_versions')
    op.drop_constraint('uq_policy_version', 'policy_versions', type_='unique')
    op.drop_index('ix_approval_request_id', table_name='approval_requests')
    op.drop_index('ix_approval_status', table_name='approval_requests')
    op.drop_column('audit_chain_head', 'last_sequence_number')
    op.drop_index('ix_audit_events_sequence_number', table_name='audit_events')
    op.drop_index('ix_audit_events_reason', table_name='audit_events')
    op.drop_index('ix_audit_events_decision', table_name='audit_events')
    op.drop_index('ix_audit_events_agent_id', table_name='audit_events')
    op.drop_index('ix_audit_events_timestamp', table_name='audit_events')
    op.drop_index('ix_audit_events_auth_id', table_name='audit_events')
    op.drop_index('ix_audit_events_request_id', table_name='audit_events')
    op.drop_column('audit_events', 'sequence_number')
    op.drop_index('ix_exec_auth_status', table_name='execution_authorizations')
    op.drop_index('ix_exec_auth_agent_id', table_name='execution_authorizations')
    op.drop_table('execution_authorizations')
