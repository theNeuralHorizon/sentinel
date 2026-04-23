-- Sentinel initial schema. Applied automatically on container startup.
-- Hand-written because Drizzle generate requires a live DB.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums
DO $$ BEGIN
  CREATE TYPE scan_status AS ENUM ('pending','running','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE scan_kind AS ENUM ('full','incremental','drift','ml_bom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ecosystem AS ENUM (
    'npm','pypi','cargo','gomodules','maven','nuget','rubygems',
    'composer','container','ml_model','dataset','mcp_server','other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE severity AS ENUM ('critical','high','medium','low','info');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE vuln_state AS ENUM ('open','triaging','suppressed','fixed','accepted_risk');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE remediation_kind AS ENUM (
    'pr_bump','pr_swap','issue_ticket','notify_slack',
    'rotate_secret','escalate_oncall','custom_n8n'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE remediation_state AS ENUM (
    'proposed','queued','dispatched','succeeded','failed','rolled_back'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_slug_idx ON projects(slug);
CREATE INDEX IF NOT EXISTS projects_tags_idx ON projects USING gin(tags);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  git_ref TEXT,
  commit_sha TEXT,
  status scan_status NOT NULL DEFAULT 'pending',
  kind scan_kind NOT NULL DEFAULT 'full',
  triggered_by TEXT NOT NULL DEFAULT 'manual',

  component_count INT NOT NULL DEFAULT 0,
  vuln_count INT NOT NULL DEFAULT 0,
  critical_count INT NOT NULL DEFAULT 0,
  high_count INT NOT NULL DEFAULT 0,
  medium_count INT NOT NULL DEFAULT 0,
  low_count INT NOT NULL DEFAULT 0,

  risk_score INT NOT NULL DEFAULT 0,
  sbom_s3_key TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scans_project_idx ON scans(project_id);
CREATE INDEX IF NOT EXISTS scans_status_idx ON scans(status);
CREATE INDEX IF NOT EXISTS scans_created_at_idx ON scans(created_at DESC);

CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  ecosystem ecosystem NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  purl TEXT NOT NULL,
  cpe TEXT,
  supplier TEXT,
  source_url TEXT,

  license TEXT,
  license_confidence TEXT,
  license_risk TEXT,
  is_transitive BOOLEAN NOT NULL DEFAULT false,
  direct_dependents TEXT[] NOT NULL DEFAULT '{}',

  hash_sha256 TEXT,
  signature JSONB NOT NULL DEFAULT '{}'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1024),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scan_id, purl)
);
CREATE INDEX IF NOT EXISTS components_scan_idx ON components(scan_id);
CREATE INDEX IF NOT EXISTS components_project_idx ON components(project_id);
CREATE INDEX IF NOT EXISTS components_purl_idx ON components(purl);
CREATE INDEX IF NOT EXISTS components_name_ver_idx ON components(name, version);
CREATE INDEX IF NOT EXISTS components_embedding_idx
  ON components USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,

  advisory_id TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  details TEXT,

  severity severity NOT NULL,
  cvss_score REAL,
  cvss_vector TEXT,
  epss_score REAL,
  epss_percentile REAL,

  ai_risk_score INT,
  ai_reasoning TEXT,
  exploitability TEXT,
  business_impact TEXT,

  fixed_versions TEXT[] NOT NULL DEFAULT '{}',
  affected_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  references JSONB NOT NULL DEFAULT '[]'::jsonb,

  state vuln_state NOT NULL DEFAULT 'open',
  suppressed_reason TEXT,

  published_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vulns_component_idx ON vulnerabilities(component_id);
CREATE INDEX IF NOT EXISTS vulns_scan_idx ON vulnerabilities(scan_id);
CREATE INDEX IF NOT EXISTS vulns_advisory_idx ON vulnerabilities(advisory_id);
CREATE INDEX IF NOT EXISTS vulns_severity_idx ON vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS vulns_state_idx ON vulnerabilities(state);
CREATE INDEX IF NOT EXISTS vulns_risk_idx ON vulnerabilities(ai_risk_score);

CREATE TABLE IF NOT EXISTS remediations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vulnerability_id UUID NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,

  kind remediation_kind NOT NULL,
  state remediation_state NOT NULL DEFAULT 'proposed',

  workflow_id TEXT,
  execution_id TEXT,
  playbook TEXT,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,

  proposal_reasoning TEXT,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,

  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS remediations_vuln_idx ON remediations(vulnerability_id);
CREATE INDEX IF NOT EXISTS remediations_state_idx ON remediations(state);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  scan_id UUID,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  subject TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_project_idx ON events(project_id);
CREATE INDEX IF NOT EXISTS events_scan_idx ON events(scan_id);
CREATE INDEX IF NOT EXISTS events_kind_idx ON events(kind);
CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rules JSONB NOT NULL DEFAULT '{"conditions":[],"action":"warn"}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS policies_slug_idx ON policies(slug);
CREATE INDEX IF NOT EXISTS policies_enabled_idx ON policies(enabled);
