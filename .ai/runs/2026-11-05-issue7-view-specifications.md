# Issue #7 — specyfikacje widoków nowych danych i korekt

Cele: opisać widok działań korporacyjnych, powiązań instrumentów oraz historię migawek i korekt; uwzględnić ręczne tworzenie migawki na `/data`.
Specyfikacje: [działania korporacyjne](../specs/implemented/2026-11-05-corporate-actions-view.md), [tożsamości instrumentów](../specs/2026-11-05-instrument-identities-view.md), [migawki i korekty](../specs/2026-11-05-snapshot-and-corrections-view.md).
Status: done

2026-11-05 — Dodano trzy specyfikacje dla issue #7 oraz diagram modelu żądań migawek.
Decyzje: widok działań i tożsamości jest odczytowy; migawka powstaje ręcznie przez trwałe żądanie workera z kluczem idempotencji.
Pułapka: przegląd zakresu wskazał możliwość dalszego podziału migawki; zachowano uzgodniony z właścicielem przepływ w jednej specyfikacji.
Pozostało: implementacja i weryfikacja według osobnych etapów specyfikacji.
