CREATE TABLE raw_file_manifests (
  id uuid PRIMARY KEY,
  chunk_id uuid NOT NULL UNIQUE REFERENCES import_chunks(id),
  relative_path text NOT NULL CHECK (relative_path ~ '^import/[a-f0-9]{64}\.json$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK (provider = 'eodhd'),
  data_class text NOT NULL CHECK (data_class = 'daily_bars'),
  market_scope text NOT NULL CHECK (market_scope IN ('main', 'newconnect', 'all')),
  min_date date,
  max_date date,
  row_count integer NOT NULL CHECK (row_count >= 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((row_count = 0 AND min_date IS NULL AND max_date IS NULL)
    OR (row_count > 0 AND min_date IS NOT NULL AND max_date IS NOT NULL AND min_date <= max_date))
);

CREATE TABLE daily_bar_revisions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'eodhd'),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  session_date date NOT NULL,
  open numeric NOT NULL CHECK (open >= 0),
  high numeric NOT NULL CHECK (high >= 0),
  low numeric NOT NULL CHECK (low >= 0),
  close numeric NOT NULL CHECK (close >= 0),
  adjusted_close numeric CHECK (adjusted_close >= 0),
  volume numeric NOT NULL CHECK (volume >= 0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  first_manifest_id uuid NOT NULL REFERENCES raw_file_manifests(id),
  available_at timestamptz NOT NULL DEFAULT now(),
  availability_evidence text NOT NULL DEFAULT 'first_import' CHECK (availability_evidence = 'first_import'),
  UNIQUE (provider, source_symbol_id, session_date, fingerprint)
);
CREATE INDEX daily_bar_revisions_by_source ON daily_bar_revisions(source_symbol_id, session_date, available_at);

CREATE TABLE raw_file_manifest_revisions (
  manifest_id uuid NOT NULL REFERENCES raw_file_manifests(id),
  revision_id uuid NOT NULL REFERENCES daily_bar_revisions(id),
  PRIMARY KEY (manifest_id, revision_id)
);
ALTER TABLE import_chunks ADD COLUMN manifest_id uuid REFERENCES raw_file_manifests(id);

CREATE FUNCTION forbid_archive_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'archive records are append-only';
END $$;
CREATE TRIGGER raw_manifest_immutable BEFORE UPDATE OR DELETE ON raw_file_manifests
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER bar_revision_immutable BEFORE UPDATE OR DELETE ON daily_bar_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER manifest_revision_immutable BEFORE UPDATE OR DELETE ON raw_file_manifest_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
