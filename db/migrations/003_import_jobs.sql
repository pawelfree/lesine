CREATE TABLE import_jobs (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'eodhd'),
  market_scope text NOT NULL CHECK (market_scope IN ('main', 'newconnect', 'all')),
  data_classes text[] NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  scope_hash text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('backfill', 'incremental')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'quota_wait', 'paused', 'failed', 'done')),
  cursor text,
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after_utc timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  CHECK (data_classes = ARRAY['daily_bars']::text[])
);
CREATE UNIQUE INDEX import_jobs_active_scope ON import_jobs(provider, scope_hash)
  WHERE status IN ('queued', 'running', 'quota_wait', 'paused');
CREATE INDEX import_jobs_runnable ON import_jobs(status, retry_after_utc, lease_expires_at, started_at);

CREATE TABLE import_chunks (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES import_jobs(id),
  resource_key text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  response_hash text,
  file_id text,
  error_code text,
  UNIQUE (job_id, resource_key, from_date, to_date)
);
CREATE INDEX import_chunks_pending ON import_chunks(job_id, status, resource_key, from_date);
CREATE INDEX import_chunks_covered ON import_chunks(resource_key, from_date, to_date) WHERE status = 'done';
