"""
Minimal, additive, idempotent schema upgrades for EXISTING databases.

SQLAlchemy's create_all() creates new tables but never adds columns to existing ones.
Each entry here adds one column only if it is missing, with a safe default, so existing
rows are preserved. Nothing is dropped, renamed or rewritten.
"""
from sqlalchemy import inspect, text

ADDITIVE_COLUMNS = [
    # (table, column, DDL type + default)
    ('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0'),
    ('users', 'verification_status', "VARCHAR(20) NOT NULL DEFAULT 'unverified'"),
    ('users', 'suspended_reason', 'VARCHAR(255)'),
    ('users', 'suspended_at', 'TIMESTAMP'),
]


def ensure_schema(db, logger=None):
    insp = inspect(db.engine)
    existing_tables = set(insp.get_table_names())
    added = []
    for table, column, ddl in ADDITIVE_COLUMNS:
        if table not in existing_tables:
            continue
        cols = {c['name'] for c in insp.get_columns(table)}
        if column in cols:
            continue
        with db.engine.begin() as conn:
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {ddl}'))
        added.append(f'{table}.{column}')
    if added and logger:
        logger.info('Schema upgrade: added columns %s', ', '.join(added))
    return added
