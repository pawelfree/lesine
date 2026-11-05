ALTER TABLE import_jobs DROP CONSTRAINT import_jobs_data_classes_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_data_classes_check
  CHECK (data_classes IN (ARRAY['daily_bars']::text[], ARRAY['dividends']::text[], ARRAY['splits']::text[]));

ALTER TABLE import_chunks ADD COLUMN data_class text NOT NULL DEFAULT 'daily_bars'
  CHECK (data_class IN ('daily_bars', 'dividends', 'splits'));
ALTER TABLE import_chunks DROP CONSTRAINT import_chunks_job_id_resource_key_from_date_to_date_key;
ALTER TABLE import_chunks ADD CONSTRAINT import_chunks_job_resource_class_dates_unique
  UNIQUE (job_id, resource_key, data_class, from_date, to_date);
CREATE INDEX import_chunks_action_covered ON import_chunks(resource_key, data_class, from_date, to_date)
  WHERE status = 'done' AND manifest_id IS NOT NULL;

ALTER TABLE raw_file_manifests DROP CONSTRAINT raw_file_manifests_data_class_check;
ALTER TABLE raw_file_manifests ADD CONSTRAINT raw_file_manifests_data_class_check
  CHECK (data_class IN ('daily_bars', 'dividends', 'splits'));

CREATE TABLE corporate_action_revisions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'eodhd'),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  data_class text NOT NULL CHECK (data_class IN ('dividends', 'splits')),
  ex_date date NOT NULL,
  event_key text NOT NULL CHECK (event_key ~ '^[a-f0-9]{64}$'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('active', 'withdrawn')),
  ambiguous boolean NOT NULL DEFAULT false,
  amount numeric CHECK (amount >= 0),
  adjusted_amount numeric CHECK (adjusted_amount >= 0),
  currency text,
  declaration_date date,
  record_date date,
  payment_date date,
  split_numerator numeric CHECK (split_numerator > 0),
  split_denominator numeric CHECK (split_denominator > 0),
  split_raw text,
  first_manifest_id uuid NOT NULL REFERENCES raw_file_manifests(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  availability_evidence text NOT NULL CHECK (availability_evidence IN
    ('declaration_date_only', 'ex_date_only', 'first_import')),
  CHECK (state = 'withdrawn' OR
    (data_class = 'dividends' AND currency IS NOT NULL AND adjusted_amount IS NOT NULL) OR
    (data_class = 'splits' AND split_numerator IS NOT NULL AND split_denominator IS NOT NULL)),
  CHECK (state = 'active' OR amount IS NULL)
);
CREATE INDEX corporate_action_by_source ON corporate_action_revisions
  (source_symbol_id, data_class, ex_date, first_seen_at);
CREATE INDEX corporate_action_current ON corporate_action_revisions
  (provider, source_symbol_id, data_class, event_key, first_seen_at DESC);

CREATE TABLE action_manifest_revisions (
  manifest_id uuid NOT NULL REFERENCES raw_file_manifests(id),
  revision_id uuid NOT NULL REFERENCES corporate_action_revisions(id),
  PRIMARY KEY (manifest_id, revision_id)
);
CREATE TRIGGER action_revision_immutable BEFORE UPDATE OR DELETE ON corporate_action_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER action_manifest_revision_immutable BEFORE UPDATE OR DELETE ON action_manifest_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();

-- Snapshot migration 010 may have landed first. In that order, join its archive
-- generation counter now; in the opposite order, migration 010 adds this trigger.
DO $$ BEGIN
  IF to_regclass('public.archive_generation_state') IS NOT NULL THEN
    ALTER TABLE corporate_action_revisions ADD COLUMN archive_generation bigint NOT NULL DEFAULT 1;
    CREATE TRIGGER action_archive_generation BEFORE INSERT ON corporate_action_revisions
      FOR EACH ROW EXECUTE FUNCTION assign_action_archive_generation();
  END IF;
END $$;
