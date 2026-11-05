# Backlogs

## .ai/specs/2026-11-04-local-gpw-history-with-coverage.md

Backlog source: .ai/specs/2026-11-04-local-gpw-history-with-coverage.md
Last filed: 2026-11-05

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | [#1](https://github.com/pawelfree/lesine/issues/1) | Inwentaryzacja źródła i lokalny import EOD | — | — | no |
| E01-S01 | [#3](https://github.com/pawelfree/lesine/issues/3) | Katalog źródła lub wyraźny brak dostępu | #1 | — | no |
| E01-S01-T01 | [#8](https://github.com/pawelfree/lesine/issues/8) | Domknąć istniejący szkielet, migracje i ochronę dostępu | #1 | — | no |
| E01-S01-T02 | [#9](https://github.com/pawelfree/lesine/issues/9) | Adapter katalogu i ograniczona próbka źródła | #1 | E01-S01-T01 (#8) | no |
| E01-S02 | [#4](https://github.com/pawelfree/lesine/issues/4) | Wznawialny import EOD z kontrolą budżetu | #1 | E01-S01 (#3) | no |
| E01-S02-T01 | [#10](https://github.com/pawelfree/lesine/issues/10) | Trwałe zadania, kursor, budżet i dzierżawa workera | #1 | E01-S01 (#3) | no |
| E01-S02-T02 | [#11](https://github.com/pawelfree/lesine/issues/11) | Niezmienne pliki, rewizje, manifest i kopia | #1 | E01-S02-T01 (#10) | no |
| E01-S02-T03 | [#15](https://github.com/pawelfree/lesine/issues/15) | Ograniczyć liczbę wywołań EODHD przez większe partie importu | #1 | E01-S02-T02 (#11) | no |
| E01-S03 | [#5](https://github.com/pawelfree/lesine/issues/5) | Widok zakresów EOD i luk | #1 | E01-S02 (#4) | no |
| E02 | [#2](https://github.com/pawelfree/lesine/issues/2) | Kompletność historii i korekty | — | E01 (#1) | no |
| E02-S01 | [#6](https://github.com/pawelfree/lesine/issues/6) | Działania, tożsamości i trwałe migawki | #2 | E01-S02 (#4) | no |
| E02-S02 | [#7](https://github.com/pawelfree/lesine/issues/7) | Status każdego elementu potwierdzonego katalogu | #2 | E02-S01 (#6) | no |

The parent of each task is its `Story:` link in the GitHub issue body. A dependency names prerequisite work; it does not imply that its parent story is complete. Q06 blocks acceptance on a real GPW source sample, and Q03 blocks full-history completeness claims. Neither blocks fixture-based implementation of the import and archive mechanisms.
