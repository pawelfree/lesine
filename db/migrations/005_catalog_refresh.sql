CREATE TABLE catalog_refresh_jobs (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'eodhd'),
  origin text NOT NULL CHECK (origin IN ('eodhd_war_pair', 'legacy')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'quota_wait', 'failed', 'done')),
  active_sha256 text,
  active_count integer CHECK (active_count >= 0),
  active_fetched_at timestamptz,
  delisted_sha256 text,
  delisted_count integer CHECK (delisted_count >= 0),
  delisted_fetched_at timestamptz,
  error_code text,
  retry_after_utc timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (origin <> 'legacy' OR status = 'done'),
  CHECK ((active_sha256 IS NULL) = (active_fetched_at IS NULL)),
  CHECK ((delisted_sha256 IS NULL) = (delisted_fetched_at IS NULL))
);
CREATE UNIQUE INDEX catalog_refresh_one_active
  ON catalog_refresh_jobs(provider)
  WHERE origin = 'eodhd_war_pair' AND status IN ('queued', 'running', 'quota_wait');
CREATE INDEX catalog_refresh_runnable
  ON catalog_refresh_jobs(status, retry_after_utc, lease_expires_at, created_at);

CREATE TABLE catalog_refresh_members (
  job_id uuid NOT NULL REFERENCES catalog_refresh_jobs(id),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  PRIMARY KEY (job_id, source_symbol_id)
);
CREATE INDEX catalog_refresh_member_symbol ON catalog_refresh_members(source_symbol_id);

CREATE TABLE catalog_head (
  provider text PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES catalog_refresh_jobs(id)
);

DO $$
DECLARE legacy_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM source_symbols WHERE provider = 'eodhd') THEN
    legacy_id := gen_random_uuid();
    INSERT INTO catalog_refresh_jobs(id, provider, origin, status)
      VALUES (legacy_id, 'eodhd', 'legacy', 'done');
    INSERT INTO catalog_refresh_members(job_id, source_symbol_id)
      SELECT legacy_id, id FROM source_symbols WHERE provider = 'eodhd';
    INSERT INTO catalog_head(provider, job_id) VALUES ('eodhd', legacy_id);
  END IF;
END $$;
