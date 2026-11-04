CREATE TABLE source_depth_samples (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  provider_symbol text NOT NULL,
  listing_state text NOT NULL CHECK (listing_state IN ('active', 'delisted')),
  data_class text NOT NULL CHECK (data_class IN ('eod', 'dividends', 'splits')),
  sample_from date NOT NULL,
  sample_to date NOT NULL,
  earliest_observed date,
  latest_observed date,
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('available', 'empty', 'unavailable', 'quota_wait')),
  response_sha256 text,
  error_code text
);
