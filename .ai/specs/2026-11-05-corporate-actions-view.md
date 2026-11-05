# Widok działań korporacyjnych GPW

## 📝 TLDR

Właściciel Lesine może importować dywidendy i splity, ale strona `/data` nie pokazuje zapisanych zdarzeń, dowodów ani stanu ich importu. Proponowana część #7 ma umożliwić odczyt tych informacji z lokalnego archiwum, bez ponownego raportowania notowań EOD i bez deklarowania kompletności historii.

## 📝 Problem Statement

Import z issue #6 zapisuje odpowiedzi źródłowe i kolejne rewizje działań. Obecny widok pokazuje status i zakres notowań EOD, więc właściciel nie widzi rodzaju i daty zapisanego działania, jego pochodzenia, korekty lub przyczyny nieudanego importu nowej klasy danych. Brak wiersza nie dowodzi braku zdarzenia u dostawcy.

## 📝 Proposed Solution

Dodać do `/data` odczyt zapisanych dywidend i splitów oraz osobny status ich importu. Widok ma wskazywać źródło, datę zdarzenia, lokalny czas pozyskania, identyfikator dowodu i ograniczenia dostępności. Istniejący raport EOD pozostaje jedynym raportem notowań. [QuantConnect LEAN](https://www.quantconnect.com/docs/v2/writing-algorithms/securities/asset-classes/us-equity/corporate-actions) rozdziela klasy działań i konsekwencje korekt cen; Lesine przejmuje rozdzielenie klas, lecz nie kopiuje amerykańskich reguł publikacji ani mechaniki portfela.

## 📝 Architecture

Nowy kontroler NestJS używa istniejących tabel i logiki wyboru najnowszej rewizji z `apps/api/src/corporate-actions.ts`. Angular rozszerza istniejącą stronę `/data`. Status zadania jest filtrowany po klasie; statusu EOD nie zastępuje status innego importu. Odczyt nie wywołuje EODHD. Importer i reguły rewizji pozostają bez zmian.

## 📝 Data Model

Bez migracji. Źródłem są `corporate_action_revisions`, `raw_file_manifests`, `source_symbols` i `import_jobs`. `event_key` grupuje rewizje, a identyfikator rewizji i SHA-256 manifestu wskazują pochodzenie. `ex_date` nie dowodzi chwili publikacji. Nie zwracać prywatnych ścieżek, surowych odpowiedzi ani tokenów.

## 📝 API Contracts

- `GET /api/corporate-actions?data_class=dividends|splits&source_symbol_id=<sha256>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&cursor=<opaque>`: maksymalnie 100 wierszy, stabilny kursor `(ex_date,event_key,id)`, obwiednia `{data:{rows},page:{next_cursor}}`. Wiersz zawiera `event_key`, `revision_id`, `source_symbol_id`, `provider_symbol`, klasę, `ex_date`, stan `active|withdrawn`, `ambiguous`, kwotę/walutę albo stosunek podziału, `first_seen_at`, `availability_evidence`, `source_file_sha256` i sygnał istnienia starszych rewizji. Wycofanych zdarzeń nie ukrywać.
- `GET /api/corporate-actions/{event_key}/revisions`: stronicowana historia lokalnego zdarzenia z ID, wartościami, datami pierwszego zapisu i dowodami; walidowany klucz nie trafia do składni SQL.
- `GET /api/import-jobs?data_class=dividends|splits`: ostatnie zadanie klasy ze statusem, `updated_at`, `error_code` i `retry_after_utc`. Zachować dotychczasowe domyślne znaczenie endpointu dla EOD.
- Błędne filtry/kursory → `400`; brak wierszy → pusta lista; brakujący lub uszkodzony manifest → `503 archive_corrupt` bez przedstawiania rekordu jako potwierdzonego.

## 📝 UI/UX

Osobna sekcja „Działania korporacyjne” z filtrem klasy, symbolu i dat oraz stronicowaną tabelą. Rozwinięcie zdarzenia pokazuje poprzednie rewizje. Odróżnić ładowanie, pusty lokalny zbiór, zapisane dane, przerwany import, limit i błąd odczytu. „Brak zapisanych zdarzeń” nie oznacza „brak działań u dostawcy”. Filtry, tabela i rozwinięcia obsługiwane klawiaturą.

## 📝 Edge Cases & Failure Scenarios

- Ponowny import tych samych danych nie tworzy nowej widocznej rewizji; korekta pokazuje starsze i nowsze ID oraz daty zapisu.
- Zdarzenie `withdrawn` jest widoczne jako wycofane, a `ambiguous` pozostaje oznaczone.
- Wyczerpany limit, brak uprawnienia i błąd sieci są widoczne w statusie; wcześniej zapisane zdarzenia pozostają dostępne.
- Zmiana filtrów resetuje kursor; błędny kursor nie zwraca przypadkowej strony.

## 📝 Risks & Impact Review

Endpointy są addytywne. R01 zabrania nazywać datę zdarzenia dowodem historycznej dostępności. Sprawdzanie manifestów może kosztować czas; należy weryfikować unikalne pliki dla strony i zwracać `503` przy uszkodzeniu. Cofnięcie widoku nie usuwa archiwum.

## 📝 Decisions in play

R01 i R04: dowody dostępności oraz zachowanie zapisanych danych po błędzie. D07: rok danych wystarcza do rozwoju mechanizmu, ale nie potwierdza pełnej historii. N01, N02 i wyłączenie składowych indeksów bez zmian.

## 📋 Phasing

1. Odczyt zdarzeń, rewizji i statusu importu przez API.
2. Sekcja `/data` z filtrami, dowodami i stanami awarii.

## 📋 Implementation Plan

1. Dodać paginowane zapytania/API; integracyjnie sprawdzić dywidendę, split, wycofanie, korektę, pusty wynik, kursor i uszkodzony manifest. Istniejący ekran EOD dalej działa.
2. Dodać filtrowany odczyt statusu bez zmiany odpowiedzi domyślnej EOD; sprawdzić równoległe zadania różnych klas i przerwany import.
3. Dodać sekcję Angular; sprawdzić stan pusty, limit, błąd i obsługę klawiaturą w działającej aplikacji.
