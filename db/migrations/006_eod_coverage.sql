CREATE TABLE eod_coverage_input_state (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO eod_coverage_input_state(id) VALUES (1);

CREATE FUNCTION bump_eod_coverage_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE eod_coverage_input_state SET revision = revision + 1 WHERE id = 1;
  RETURN NULL;
END $$;

CREATE TRIGGER coverage_source_symbols AFTER INSERT OR UPDATE OR DELETE ON source_symbols
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_catalog_head AFTER INSERT OR UPDATE OR DELETE ON catalog_head
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_catalog_members AFTER INSERT OR UPDATE OR DELETE ON catalog_refresh_members
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_import_jobs AFTER INSERT OR UPDATE OR DELETE ON import_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_import_chunks AFTER INSERT OR UPDATE OR DELETE ON import_chunks
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_manifests AFTER INSERT OR UPDATE OR DELETE ON raw_file_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();
CREATE TRIGGER coverage_revisions AFTER INSERT OR UPDATE OR DELETE ON daily_bar_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION bump_eod_coverage_revision();

CREATE TABLE eod_coverage_reports (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  archive_last_committed_at timestamptz,
  catalog_id uuid,
  input_revision bigint NOT NULL UNIQUE,
  calculation_version integer NOT NULL DEFAULT 1 CHECK (calculation_version = 1),
  expected_scope_status text NOT NULL DEFAULT 'unknown' CHECK (expected_scope_status = 'unknown'),
  source_symbol_count integer NOT NULL CHECK (source_symbol_count >= 0)
);

CREATE TABLE eod_coverage_rows (
  report_id uuid NOT NULL REFERENCES eod_coverage_reports(id),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  provider text NOT NULL,
  provider_symbol text NOT NULL,
  market_segment text NOT NULL CHECK (market_segment IN ('main', 'newconnect', 'unclassified')),
  listing text NOT NULL CHECK (listing IN ('active', 'delisted', 'unknown')),
  in_current_catalog boolean NOT NULL,
  data_class text NOT NULL DEFAULT 'daily_bars' CHECK (data_class = 'daily_bars'),
  acquired_from date,
  acquired_to date,
  acquired_count integer NOT NULL CHECK (acquired_count >= 0),
  status text NOT NULL CHECK (status IN ('unknown', 'unclassified')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  PRIMARY KEY (report_id, source_symbol_id, data_class)
);
CREATE INDEX eod_coverage_rows_filter ON eod_coverage_rows
  (report_id, market_segment, listing, provider, status, provider_symbol, source_symbol_id);

CREATE FUNCTION forbid_eod_coverage_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'coverage report generations are immutable';
END $$;
CREATE TRIGGER coverage_reports_immutable BEFORE UPDATE OR DELETE ON eod_coverage_reports
  FOR EACH ROW EXECUTE FUNCTION forbid_eod_coverage_row_change();
CREATE TRIGGER coverage_rows_immutable BEFORE UPDATE OR DELETE ON eod_coverage_rows
  FOR EACH ROW EXECUTE FUNCTION forbid_eod_coverage_row_change();
