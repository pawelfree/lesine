# Quota-efficient EODHD import batches

## 📝 TLDR

The owner needs a one-year GPW EOD sample without spending one API call per symbol per month. Today Lesine schedules a separate request for every calendar month, even though EODHD charges one call for a longer EOD range. This proposal schedules one bounded request for each contiguous missing year-sized range per source identity while retaining the existing checkpoint, quota and immutable-response guarantees.

## 📝 Problem Statement

Issue [#15](https://github.com/pawelfree/lesine/issues/15) asks to reduce the number of EODHD calls before the first real import. The current scheduler partitions missing days by calendar month; a fresh one-year range can therefore consume about twelve calls for one source identity. The extra calls make the Free-plan development sample much slower without adding product coverage.

## 📝 Proposed Solution

Coalesce contiguous missing days for one source identity across month boundaries, capped at the existing one-year request range. Keep the worker's lease, one-request budget reservation, raw-response manifest and append-only revision transaction. Existing committed monthly chunks remain valid. This design changes import planning only; it does not introduce a daily scheduler, a new UI, a provider SDK or a new provider-error policy.

### Evidence and alternatives

- [EODHD's EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes) charges one API call per symbol request regardless of the requested date span. A longer range can therefore lower call consumption without changing provider or entitlement. Its daily limit is described in the [API limits](https://eodhd.com/financial-apis/api-limits).
- The current month-sized requests make recovery granular but spend up to twelve calls per one-year source identity. The existing per-request `ImportChunk` and fenced transaction can also checkpoint a year-sized response; a crash before commit may repeat that request, which is counted again.
- EODHD's [official TypeScript SDK](https://github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library) exposes typed EOD results, but its [HTTP layer](https://github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library/blob/main/src/http.ts) parses JSON and retries some failures internally. That would require an additional raw-response capture and per-attempt budget integration, without reducing the number of EOD calls. Keep the current HTTP boundary for this task.
- [EODHD Bulk API](https://eodhd.com/financial-apis/bulk-api-eod-splits-dividends) prices a whole-exchange day at 100 calls and is not available on the Free plan. Assess it separately for a paid-plan daily refresh; it does not solve this Free-plan import task.
- [dlt's incremental-loading model](https://dlthub.com/docs/general-usage/incremental/cursor) illustrates persistent source-scoped state and overlap deduplication. Lesine already has equivalent durable chunks and revisions; it needs a smaller planner change, not a new ingestion framework.

## 📝 Architecture

`apps/api/src/import-jobs.controller.ts` owns planning. For an `incremental` request, it enumerates dates for each locally catalogued EODHD source identity, subtracts only ranges whose prior chunks are `done` **and** have a committed manifest, then groups consecutive missing dates without a month boundary. For `backfill`, it deliberately includes the requested dates even when previously archived. Split any contiguous run only when its inclusive span would exceed the existing accepted API span of 366 elapsed days. Thus the one-year range offered by `/data` creates one chunk per identity when no dates are archived, including a range crossing calendar months. A gap between two committed ranges produces separate chunks; never fill that gap by re-requesting committed dates just to make one larger call.

Each planned `ImportChunk` still represents exactly one HTTP attempt range for one source identity, with a stable `from_date` and `to_date`. The existing PostgreSQL lease and per-attempt local reservation remain the arbiter. `apps/worker/src/import-jobs.ts` still sends one request per claimed chunk and commits the exact response file, manifest, source-keyed revisions and checkpoint together. The parser's existing 5 MB raw-response limit remains; an oversized response fails durably as an invalid payload rather than silently truncating or inventing coverage. A later bounded-fallback design would need to reserve every additional provider attempt explicitly.

The worker retains its existing quota, 429, authentication and network-error policies. Every new provider attempt must still reserve one local budget unit before `fetch`; this task does not add hidden retries. The current generic handling of provider HTTP 402 is a separately deployable error-policy issue and is not changed here.

The worker's startup reconciliation and the archived monthly chunks are unchanged. A `done` monthly chunk with a manifest excludes its dates from a new incremental job; a legacy `done` chunk without a manifest is rescheduled under the current archive rule. No migration or rewriting of existing raw files, revisions or job rows is proposed. The Data page continues to show `completed_chunks / total_chunks`; these counts will be smaller for newly planned jobs and are not comparable with older monthly jobs. No new UI control or automatic daily job creation is proposed.

## 📝 Data Model and contracts

No table or route shape changes. `ImportJob`, `ImportChunk`, `RawFileManifest`, `daily_bar_revisions` and the `/api/import-jobs` request/response formats retain their current meanings. The planner changes only the `from_date`/`to_date` values and number of newly inserted chunks. Existing jobs keep their already materialized chunk ranges; a restart resumes those ranges rather than replanning them. API request dates remain bounded to the existing one-year range.

`LESINE_EODHD_DAILY_BUDGET` continues to count Lesine's reserved provider attempts across catalog probes and EOD imports, not calls made outside Lesine. A call rejected before data is returned can still consume EODHD quota under its published accounting; the worker never assumes that an error is free. Credentials remain in the worker environment and are excluded from the database, response files, logs and UI.

## 📝 Acceptance criteria and failure scenarios

| Scenario | Required result |
|---|---|
| Fresh one-year range, one catalogued identity | One scheduled chunk and one EOD request/one local reservation; compare with the twelve month-sized calls under the current planner. The returned payload is within the existing 5 MB validation bound. |
| Prior manifest-backed monthly chunks plus a missing interval | Only the missing dates are requested, coalesced across month boundaries up to the range cap. Existing chunk dates are not re-requested or rewritten. |
| Legacy completed chunk without a manifest | Its dates are scheduled again, preserving the current rule that an unverified response does not prove archive coverage. |
| Restart after committed work or a stale lease | Persisted chunks are reused; only the current lease can commit the response, manifest, revisions and checkpoint. An interrupted in-flight call may be repeated with a new budget reservation. |
| Same bars and then a provider correction | Repeat observations create no duplicate revision; changed values append a revision and retain the prior raw response. |
| Local budget exhausted or provider returns 429 | Preserve the existing `quota_wait`/`Retry-After` behavior and completed chunks; no unreserved provider retry occurs. |
| Missing token, 401/403, network error or oversized response | Preserve completed work and current sanitized failure/paused semantics; do not mark the job or archive complete. |
| Optional real authorized Free-plan sample | When credentials are available, record request count, payload size, entitlement and outcome without publishing credentials. Lack of credentials does not block this planner PR; report fixture evidence only and do not claim real GPW coverage. |

## 📝 Risks and compatibility

Longer requests move the restart checkpoint from roughly one month to up to one year for one source identity. A crash after EODHD served the response but before the manifest commits may spend another call on retry; the call-saving comparison is therefore a normal-path estimate, not a guarantee. A source may return an unexpectedly large or malformed payload; the existing 5 MB validation bound and atomic publication prevent partial archive state. The local budget is not the provider's live account counter; existing HTTP 402 handling remains a separate limitation for a later error-policy task.

The change is compatible with existing monthly chunks because they stay stored and are excluded through their committed manifest-backed date ranges. There is no database migration, external API schema change, new permission or token exposure. A code rollout must preserve active jobs' persisted chunks and confirm that old and new ranges can coexist. Rollback is to the previous planner code; archived response files and revisions remain intact. Keep the existing backup guidance for valuable data.

## 📝 Decisions in play

- **D07 (product owner):** the one-year Free range is development data; the same importer must later support authorized full history.
- **R04 (product owner):** normally fetch only missing/new ranges, retain completed work and obey the source budget; explicit bounded rechecks can find corrections.
- **R01 (product owner):** retain raw provenance so later tests can use only data available at decision time.
- **Q06:** account entitlement and real GPW source depth are still unverified; this blocks real-data acceptance, not fixture-based implementation.

No approved decision is superseded.

## 📋 Phasing

**Phase 1 — quota-efficient EOD planning and verification.** Ship the planner change, fixture coverage and README correction in one implementation PR. Each step leaves the running application usable.

## 📋 Implementation Plan

1. Change the SQL missing-range grouping in `apps/api/src/import-jobs.controller.ts` to coalesce contiguous dates across months, capped at the current API's 366-day elapsed span. Extend `apps/api/src/import-jobs.integration.spec.ts` for a fresh one-year range, a middle gap, manifest-backed monthly history, legacy unmanifested history and a pre-existing active job. Preserve the published API shape and persisted jobs.
2. Extend the isolated PostgreSQL/fake-provider worker integration test to assert HTTP attempt count, one reservation per attempt, payload hash/manifest/revision publication, restart/lease fencing, corrections and the unchanged 429 behavior. Change `apps/worker/src/import-jobs.ts` only if the longer response requires it. Keep the 5 MB guard and current archive startup checks.
3. Update `README.md` to describe year-sized bounded requests and the changed checkpoint granularity. Run the configured build, unit and isolated PostgreSQL integration gates. When credentials are available, additionally exercise one authorized one-year source sample and record call count and response size; otherwise report the evidence limit without blocking the fixture-verified PR.
