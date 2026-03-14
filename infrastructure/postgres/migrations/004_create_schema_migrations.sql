-- Migration: 004_create_schema_migrations
-- Creates the schema_migrations tracking table (applied last — self-referential)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record all previously applied migrations
INSERT INTO schema_migrations (version) VALUES
    ('001_create_users'),
    ('002_create_progress'),
    ('003_create_submissions'),
    ('004_create_schema_migrations')
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations for idempotent deployment';
