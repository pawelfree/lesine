-- Existing report generations are immutable evidence of the former report shape.
-- Advance the input revision so the next read creates a generation without that shape.
ALTER TABLE eod_coverage_reports DROP COLUMN expected_scope_status;
UPDATE eod_coverage_input_state SET revision = revision + 1 WHERE id = 1;
