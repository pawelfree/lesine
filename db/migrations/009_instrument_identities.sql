CREATE TABLE instruments (
  id uuid PRIMARY KEY,
  stable_key text NOT NULL UNIQUE CHECK (stable_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$')
);

CREATE TABLE identity_batches (
  id uuid PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  relative_path text NOT NULL CHECK (relative_path ~ '^identity/[a-f0-9]{64}\.json$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  predecessor_id uuid REFERENCES identity_batches(id),
  asserted_by text NOT NULL DEFAULT 'local_owner' CHECK (asserted_by = 'local_owner')
);

CREATE TABLE identity_links (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES identity_batches(id),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  instrument_id uuid NOT NULL REFERENCES instruments(id),
  valid_from date NOT NULL,
  valid_to_exclusive date,
  evidence_source text NOT NULL,
  evidence_ref text NOT NULL,
  evidence_observed_at date NOT NULL,
  CHECK (valid_to_exclusive IS NULL OR valid_from < valid_to_exclusive),
  UNIQUE (batch_id, source_symbol_id, valid_from)
);
CREATE INDEX identity_links_source_period ON identity_links(batch_id, source_symbol_id, valid_from);
CREATE INDEX identity_links_instrument_period ON identity_links(batch_id, instrument_id, valid_from);

CREATE TABLE identity_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  batch_id uuid NOT NULL REFERENCES identity_batches(id)
);

CREATE TRIGGER instruments_immutable BEFORE UPDATE OR DELETE ON instruments
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER identity_batches_immutable BEFORE UPDATE OR DELETE ON identity_batches
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER identity_links_immutable BEFORE UPDATE OR DELETE ON identity_links
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
