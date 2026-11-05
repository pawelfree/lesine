CREATE TABLE archive_generation_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation bigint NOT NULL CHECK (generation >= 1)
);
INSERT INTO archive_generation_state(singleton, generation) VALUES (true, 1);

ALTER TABLE daily_bar_revisions ADD COLUMN archive_generation bigint NOT NULL DEFAULT 1;
ALTER TABLE raw_file_manifests ADD COLUMN archive_generation bigint NOT NULL DEFAULT 1;

CREATE FUNCTION assign_manifest_archive_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE archive_generation_state SET generation = generation + 1
    WHERE singleton = true RETURNING generation INTO NEW.archive_generation;
  RETURN NEW;
END $$;
CREATE TRIGGER manifest_archive_generation BEFORE INSERT ON raw_file_manifests
  FOR EACH ROW EXECUTE FUNCTION assign_manifest_archive_generation();

CREATE FUNCTION assign_bar_archive_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE archive_generation_state SET generation = generation + 1
    WHERE singleton = true RETURNING generation INTO NEW.archive_generation;
  RETURN NEW;
END $$;
CREATE TRIGGER bar_archive_generation BEFORE INSERT ON daily_bar_revisions
  FOR EACH ROW EXECUTE FUNCTION assign_bar_archive_generation();

CREATE FUNCTION assign_action_archive_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE archive_generation_state SET generation = generation + 1
    WHERE singleton = true RETURNING generation INTO NEW.archive_generation;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.corporate_action_revisions') IS NOT NULL THEN
    ALTER TABLE corporate_action_revisions ADD COLUMN archive_generation bigint NOT NULL DEFAULT 1;
    CREATE TRIGGER action_archive_generation BEFORE INSERT ON corporate_action_revisions
      FOR EACH ROW EXECUTE FUNCTION assign_action_archive_generation();
  END IF;
END $$;

CREATE TABLE data_snapshots (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  as_of_utc timestamptz NOT NULL,
  source_symbol_ids text[] NOT NULL CHECK (cardinality(source_symbol_ids) BETWEEN 1 AND 500),
  data_classes text[] NOT NULL CHECK (cardinality(data_classes) BETWEEN 1 AND 3),
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  availability_policy text NOT NULL CHECK (availability_policy IN ('strict_first_seen_v1', 'research_assumed_v1')),
  archive_generation bigint NOT NULL CHECK (archive_generation >= 1),
  identity_batch_id uuid,
  evidence text NOT NULL CHECK (evidence IN ('verified', 'assumed', 'incomplete')),
  allow_missing boolean NOT NULL,
  missing jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing) = 'array'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$')
);

CREATE TABLE snapshot_bar_revisions (
  snapshot_id uuid NOT NULL REFERENCES data_snapshots(id),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  session_date date NOT NULL,
  revision_id uuid NOT NULL REFERENCES daily_bar_revisions(id),
  availability_evidence text NOT NULL CHECK (availability_evidence IN ('first_import', 'research_assumption')),
  PRIMARY KEY (snapshot_id, source_symbol_id, session_date)
);
CREATE INDEX snapshot_bars_by_revision ON snapshot_bar_revisions(revision_id);

CREATE TABLE snapshot_scope_manifests (
  snapshot_id uuid NOT NULL REFERENCES data_snapshots(id),
  manifest_id uuid NOT NULL REFERENCES raw_file_manifests(id),
  PRIMARY KEY (snapshot_id, manifest_id)
);

-- The action and identity tables are delivered independently. Their migrations add
-- the foreign keys when they run after this migration; this migration adds them
-- when those capabilities are already present.
CREATE TABLE snapshot_action_revisions (
  snapshot_id uuid NOT NULL REFERENCES data_snapshots(id),
  source_symbol_id text NOT NULL REFERENCES source_symbols(id),
  data_class text NOT NULL CHECK (data_class IN ('dividends', 'splits')),
  ex_date date NOT NULL,
  event_key text NOT NULL,
  action_revision_id uuid NOT NULL,
  availability_evidence text NOT NULL CHECK (availability_evidence = 'research_assumption'),
  PRIMARY KEY (snapshot_id, data_class, source_symbol_id, event_key)
);
CREATE INDEX snapshot_actions_by_revision ON snapshot_action_revisions(action_revision_id);

DO $$ BEGIN
  IF to_regclass('public.corporate_action_revisions') IS NOT NULL THEN
    ALTER TABLE snapshot_action_revisions ADD CONSTRAINT snapshot_action_revision_fk
      FOREIGN KEY (action_revision_id) REFERENCES corporate_action_revisions(id);
  END IF;
  IF to_regclass('public.identity_batches') IS NOT NULL THEN
    ALTER TABLE data_snapshots ADD CONSTRAINT data_snapshots_identity_batch_fk
      FOREIGN KEY (identity_batch_id) REFERENCES identity_batches(id);
  END IF;
END $$;

CREATE TRIGGER snapshot_immutable BEFORE UPDATE OR DELETE ON data_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER snapshot_bar_immutable BEFORE UPDATE OR DELETE ON snapshot_bar_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER snapshot_manifest_immutable BEFORE UPDATE OR DELETE ON snapshot_scope_manifests
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
CREATE TRIGGER snapshot_action_immutable BEFORE UPDATE OR DELETE ON snapshot_action_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_archive_row_change();
