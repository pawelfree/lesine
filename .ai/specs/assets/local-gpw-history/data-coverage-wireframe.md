# Data coverage — low-fidelity screen reference

Status: Accepted by the owner on 2026-11-04 (reply “TAK” to the proposed `/data` screen reference). The confirmed App Spec §3.5 fixes the route and user task; this low-fidelity version is the accepted UI reference for the local GPW archive spec. It is not an implemented screen.

## Desktop layout at `/data`

```text
Lesine  [Today] [History] [Tests] [Data coverage]

Data coverage
What is available locally for GPW Main Market and NewConnect?

[Source: EODHD ▼]  [Market: All ▼]  [Status: All ▼]
[Data class: All ▼] [Listing: Active + delisted ▼]

Import status: Paused · 128 / 420 batches completed
Last update: 2026-11-03 22:10 Europe/Warsaw
Next retry: 2026-11-04 09:00 · Quota remaining: 12 calls
[Start import / Resume import]  [View job details]

Expected catalog: 420 entries (verified scope)
Provider available: 390 · Acquired: 375 · Gaps: 45
Source and date ranges are evidence, not a claim of full GPW history.

Market      Class             Expected        Provider        Acquired      Status
Main        Daily bars        1991–today      1995–today      1995–today    Partial
NewConnect  Daily bars        2007–today      Unknown         Unknown       Unknown
Main        Index members     1991–today      Unavailable     —             Unavailable

Selected gap: NewConnect · Daily bars
Expected range: 2007–today; source checked: EODHD WAR inventory;
classification evidence: absent; reason: provider market segment unknown.
[View source evidence] [View instrument coverage]
```

The counts and dates above are **illustrative placeholders**, not real market data. The implementation must render actual report values or “unknown”, never these numbers as seeded data.

## Narrow layout

The same controls stack vertically; summary cards precede a scrollable table whose rows expand to show source, ranges and gap reasons. The primary import action remains visible and keyboard reachable. No data/status is conveyed by color alone.

## State reference

| State | Visible content | Primary action |
|---|---|---|
| Loading | “Wczytywanie stanu danych…” and labeled progress; no stale count presented as current | Wait; previous report may be explicitly labeled as cached |
| First run / empty | “Brak pobranych danych”; source credential setup instructions without a token input on this page; expected scope marked unknown | Start inventory after local credential is configured |
| Import queued/running | Job id, completed/failed chunks, cursor, last update and “Dane częściowe” label | Inspect progress |
| Quota wait | Retry time and remaining budget, completed chunks preserved | Wait or inspect gaps |
| Paused/failed | Sanitized error code, last committed chunk and reason; no token or raw provider payload | Resume |
| Partial coverage | Expected/provider/acquired ranges separately, explicit gaps and evidence | Filter and inspect a gap |
| Complete for verified scope | Scope and source named beside “Complete”; still show unavailable classes outside that scope | Inspect coverage |
| Server/network error | “Nie można wczytać stanu”; previous report, if present, labeled with its timestamp | Retry |
| Access denied | “Dostęp lokalny odrzucony”; no source details or tokens | Open the app from its local address |

## Acceptance

The owner can distinguish an empty archive from an unavailable source, resume an interrupted job, filter both markets and active/delisted instruments, inspect one gap's provenance, and identify the report's exact scope and timestamp. Keyboard navigation reaches filters, import controls and gap details in reading order; a table/text alternative carries every status visible in the layout.
