-- Applied once when the Postgres volume is empty.
-- Creates the n8n database and runs the initial Sentinel migration.

CREATE DATABASE n8n;

\c sentinel

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
