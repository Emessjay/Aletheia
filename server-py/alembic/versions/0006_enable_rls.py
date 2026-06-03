"""Enable Row Level Security on every public-schema table — deny-all
for Supabase's auto-generated REST API.

Why this exists: our Postgres is hosted on Supabase, and Supabase
auto-publishes every table in the ``public`` schema as a REST endpoint at
``/rest/v1/<table>``, callable by anyone holding the anon key — the same
key that ships in every visitor's browser bundle. Tables created via raw
SQL (as all of ours are, through these migrations) default to RLS *off*,
which left every table readable and writable through that side door,
bypassing FastAPI entirely. Verified live before this migration: a curl
with only the anon key got ``200`` from ``/rest/v1/note``.

The fix is deny-all, not policies. All legitimate traffic goes through
FastAPI, which scopes every user-data statement with ``WHERE user_id = $N``
(the phase-3a tenancy invariant) and connects as the table *owner* — and
RLS never applies to the owner, so the app is unaffected. Enabling RLS
with zero policies means the ``anon`` and ``authenticated`` roles that
PostgREST uses see no rows and can write none. We deliberately do NOT
write per-row policies: nothing should use the REST surface at all, and a
deny-all is harder to get wrong than a policy set that must mirror the
FastAPI rules forever.

The loop is dynamic (``pg_tables``) rather than a hard-coded table list so
it also covers ``alembic_version`` and anything else present at upgrade
time. Tables created by *later* migrations must enable RLS themselves —
``tests/integration/test_rls_enabled.py`` asserts the invariant for every
table, so a future migration that forgets will fail CI.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-03
"""
from alembic import op


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            t record;
        BEGIN
            FOR t IN
                SELECT tablename FROM pg_tables WHERE schemaname = 'public'
            LOOP
                EXECUTE format(
                    'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
                    t.tablename
                );
            END LOOP;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            t record;
        BEGIN
            FOR t IN
                SELECT tablename FROM pg_tables WHERE schemaname = 'public'
            LOOP
                EXECUTE format(
                    'ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY',
                    t.tablename
                );
            END LOOP;
        END
        $$;
        """
    )
