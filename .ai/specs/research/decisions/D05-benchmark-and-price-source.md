# D05 — Benchmark and market-data source for performance tracking

- Date, owner: 2026-10-14, product owner (self)
- Context and the options weighed: Q03 asked which benchmark and market-data/price source would be used to compute the advisor's portfolio performance. The product owner proposed WIG20 as the benchmark and EODHD for GPW-listed company price history (already the platform's planned data source per `preliminary_spec.md`). He also has access to the "myfund" app (CSV export; API/scraping availability unconfirmed), which may hold other useful data but is not decided as a source.
- Decision and why: use WIG20 as the benchmark, and EODHD as the price source for the GPW-listed companies in the advisor's portfolio. "myfund" stays an unconfirmed, optional future data source (see the product brief's Later scope and collection notes).
- Consequences, and what would make us revisit it: unblocks building the performance-tracking half of the MVP (resolves Q03). Revisit if EODHD's GPW coverage or WIG20 data turns out to be incomplete or unavailable.
- Status: active
