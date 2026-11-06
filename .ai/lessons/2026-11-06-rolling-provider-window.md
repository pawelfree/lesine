# Rolling provider windows

On 2026-11-06, a Free EODHD job planned on 2026-11-05 still requested `2025-11-05` through `2026-11-05`. EODHD returned HTTP 200 with only `[{"warning":"Data is limited by one year as you have free subscription"}]`. The importer reported `invalid_depth_payload` and stopped after three successful requests that day.

The job had crossed the provider's rolling one-year boundary while waiting. Validate persisted request dates before reserving quota or calling the provider. A new incremental job should use the current entitled start date and the previous completed UTC day as its end, so committed ranges are reused without spending calls on the unfinished current day. Keep the provider warning distinct from archived empty coverage.
