---
type: run
date: 2026-10-14
status: in-progress
slug: pdf-extraction-reliability
---

# Implement: PDF extraction reliability validation

Source doc: .ai/specs/2026-10-14-pdf-extraction-reliability.md

## Goal

Add a PDF-to-structured-data extraction pipeline for the advisor's daily report, exposed through a single admin-only manual-verification endpoint, so the product owner can test whether extraction is reliable (issue #2, `A03`) before any data is persisted.

## Scope

- New, self-contained `AdvisorReportsModule`: `PdfTextExtractorService` (PDF buffer → raw text via `pdf-parse`), `AdvisorReportParserService` (raw text → structured report + warnings, pure function), `AdvisorReportsController` (`POST /admin/advisor-reports/extract`, reusing `BasicAuthGuard`).
- Unit tests for every new unit; one integration test for the authenticated endpoint plus a plain-HTTP 401 check.
- Document the new route in `BACKWARD_COMPATIBILITY.md`.

**Non-goals:** no persistence (later stories `E01-S02`–`S04`), no UI, no strategy reconstruction, no other advisors.

## Implementation Plan

### Phase 1: Extraction pipeline and manual-verification endpoint

- 1.1 Add `pdf-parse@^1.1.1` dependency and `@types/pdf-parse` + `pdf-lib` devDependencies; implement `PdfTextExtractorService` with unit tests (happy path via a `pdf-lib`-generated fixture; corrupt-buffer rejection).
- 1.2 Implement `ParsedAdvisorReport`/`SentimentRating`/`PortfolioHolding` types and `AdvisorReportParserService.parse()` with unit tests covering the happy path, each of the 7 sentiment categories, missing sections (warning, no fabrication), unrecognized market sentiment (warning, omitted), and fully unrecognized text.
- 1.3 Implement `AdvisorReportsController` + `AdvisorReportsModule` (`POST /admin/advisor-reports/extract`, `BasicAuthGuard`, file upload) with unit tests (success, missing file, unparsable file).
- 1.4 Integration test hitting the real endpoint with a real small PDF fixture (200 + shape), plus a plain unauthenticated 401 HTTP check.
- 1.5 Add the new route to `BACKWARD_COMPATIBILITY.md`'s route table.

## Risks

- The parser's assumed PDF layout is an unconfirmed guess (spec `Q1`, `⚠ NEEDS HUMAN CONFIRMATION`) — tests validate the parser against the assumed format, not the real one; the product owner must confirm against a real PDF before trusting results.
- Deviation from spec `Q2`: `pdf-parse` (the planned dependency) failed to parse valid PDFs reliably under this project's Jest runtime (old bundled pdf.js builds + Jest's module sandboxing — reproducible even on a minimal, valid, pdf-lib-generated fixture; worked fine outside Jest). Replaced with a small dependency-free extractor (stream/endstream scan + zlib inflate + Tj/TJ operator parsing) covering the same scope. No new dependency risk, but the extractor is narrower than a general PDF library — it only reads simple text-show operators, not arbitrary layouts/fonts/CMaps.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Extraction pipeline and manual-verification endpoint

- [x] 1.1 Add PdfTextExtractorService with tests — 3c8c36f (hand-rolled extractor, not pdf-parse; see Risks)
- [ ] 1.2 Add parser types and AdvisorReportParserService with tests
- [ ] 1.3 Add AdvisorReportsController + AdvisorReportsModule with tests
- [ ] 1.4 Add integration test for the endpoint
- [ ] 1.5 Document the route in BACKWARD_COMPATIBILITY.md
