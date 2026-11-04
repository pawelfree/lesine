# D07 — Free-tier development data for the first importer

- Date, owner: 2026-11-04; product owner (requester).
- Context: The owner is building from an idea, with no prior real-use case and no EODHD account sample. The archive still targets full available GPW history; the amount of data available during initial engineering is a separate matter.
- Decision: Implement the local importer and coverage view first, using up to one year of EOD data on EODHD Free as development data. Respect the source's actual call budget, persist downloaded data and request missing/new ranges during ordinary sync; allow bounded, recorded rechecks for corrections. A scheduler is an implementation option, not a mandated mechanism. Then implement the barometer and historical-validation mechanisms. The same importer can later acquire remaining available GPW history under a suitable paid plan or other authorized source.
- Why: The owner confirmed that full historical depth is unnecessary to implement the import, calculation and validation mechanisms, and wants to avoid spending calls on already stored data.
- Consequences: A year of data can exercise mechanisms but does not support a full v0 score history or a credible long-period validation under the accepted lookbacks. Actual GPW access and rights still require an account sample. The existing feature specs remain in force; keep full-history gaps visible until an authorized source supplies them.
- Status: active. Revisit after the first source sample or if the owner changes the data plan.
- Sources: owner conversation on 2026-11-04; [EODHD plans](https://eodhd.com/help/plans), [EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [limits](https://eodhd.com/financial-apis/api-limits), checked 2026-11-04.
