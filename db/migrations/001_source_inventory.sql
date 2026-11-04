CREATE TABLE IF NOT EXISTS source_symbols (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_symbol text NOT NULL,
  provider_instrument_id text,
  display_name text,
  isin text,
  instrument_type text,
  listing_state text NOT NULL CHECK (listing_state IN ('active', 'delisted', 'unknown')),
  market_segment text NOT NULL CHECK (market_segment IN ('main', 'newconnect', 'unclassified')),
  identity_evidence_ref text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS source_symbols_verified_provider_id
  ON source_symbols(provider, provider_instrument_id)
  WHERE provider_instrument_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS source_symbols_browse
  ON source_symbols(provider, market_segment, listing_state, provider_symbol);

CREATE TABLE IF NOT EXISTS catalog_probes (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  listing_state text NOT NULL CHECK (listing_state IN ('active', 'delisted')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('available', 'unavailable', 'quota_wait')),
  item_count integer,
  response_sha256 text,
  error_code text
);

CREATE TABLE IF NOT EXISTS source_daily_budget (
  provider text NOT NULL,
  utc_day date NOT NULL,
  reserved_calls integer NOT NULL CHECK (reserved_calls >= 0),
  PRIMARY KEY(provider, utc_day)
);
