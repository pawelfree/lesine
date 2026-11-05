# Widok powiązań tożsamości instrumentów GPW

## 📝 TLDR

Właściciel Lesine może zapisać datowane, własnoręcznie poświadczone powiązania identyfikatorów źródłowych z instrumentami, lecz nie ma ich listy na `/data`. Proponowana część #7 ma pokazywać aktywną partię powiązań, okresy i dowody oraz rekordy nierozstrzygnięte, bez automatycznego łączenia tickerów.

## 📝 Problem Statement

Import z issue #6 przechowuje niezmienne partie mapowań i udostępnia odczyt pojedynczego instrumentu oraz nierozstrzygniętych identyfikatorów. Brakuje widoku pozwalającego właścicielowi przejrzeć aktywne powiązania i odróżnić własne poświadczenie od niezależnie potwierdzonego faktu źródłowego.

## 📝 Proposed Solution

Rozszerzyć `/data` o listę bieżących powiązań i nierozstrzygniętych identyfikatorów z datami obowiązywania i referencją dowodu. Nie przypisywać rynku na podstawie kodu `WAR`; przy braku dowodu pokazać stan nieznany lub nierozstrzygnięty. [QuantConnect Security Master](https://www.quantconnect.com/docs/v2/writing-algorithms/datasets/quantconnect/us-equity-security-master) pokazuje sens datowanych tickerów i trwałej tożsamości; amerykańskie mapy nie są źródłem dla GPW.

## 📝 Architecture

Rozszerzyć `apps/api/src/identities.controller.ts` o paginowaną listę linków aktywnej lub wskazanej zachowanej partii. Ponownie użyć obecnej weryfikacji skrótu prywatnego pliku partii. Istniejące `GET /api/identities/unresolved` zasila drugą listę. Angular dodaje sekcję do `/data`; nie edytuje linków ani `identity_head`. Migawki nadal przypinają ID partii.

## 📝 Data Model

Bez migracji. `identity_batches` i `identity_links` są niezmienne, `identity_head` wskazuje aktywną partię, `instruments` zawiera stabilny klucz, a `source_symbols` identyfikator dostawcy. Kursor listy musi być związany z ID partii, aby zmiana head między stronami nie mieszała wierszy. API nie zwraca prywatnej ścieżki pliku.

## 📝 API Contracts

- `GET /api/identities/links?batch_id=<uuid>&cursor=<opaque>`: limit 100 i stabilne sortowanie `(source_symbol_id,valid_from,id)`; bez `batch_id` odczyt aktywnej partii. Odpowiedź `{data:{batch_id,rows},page:{next_cursor}}`. Wiersz: `source_symbol_id`, `provider`, `provider_symbol`, `instrument_id`, `stable_key`, `valid_from`, `valid_to_exclusive`, `evidence_source`, `evidence_ref`, `evidence_observed_at`, `evidence_class:owner_attested`. Parametr `batch_id` umożliwia odczyt starej partii, bez zmiany aktywnej.
- `GET /api/identities/unresolved` pozostaje źródłem nierozstrzygniętych na bieżący dzień. Oznacza brak aktywnego datowanego linku w tej partii, a nie stwierdzenie, że instrument nie istnieje.
- Nieznana partia → `404`, zły lub niezgodny z partią kursor → `400`, brak/uszkodzenie pliku dowodu → `503 archive_corrupt`; pusta partia zwraca pustą listę.

## 📝 UI/UX

Pokazać ID aktywnej partii, czas importu i etykietę „poświadczone przez właściciela”. Dwie listy: powiązane i nierozstrzygnięte. Przedział `[od, do)` opisać jako „od… do (bez tej daty)”. Odróżnić brak partii, pustą partię, błąd dowodu i ładowanie. Zmiana aktywnej partii odświeża listę od pierwszej strony z nowym ID. Listy i paginacja obsługiwane klawiaturą.

## 📝 Edge Cases & Failure Scenarios

- Jeden instrument może mieć wiele symboli/okresów; widok nie wybiera arbitralnie jednego tickera.
- Symbol z wyłącznie historycznym linkiem pozostaje nierozstrzygnięty na dziś.
- Błąd importu nowej partii nie usuwa starej aktywnej; ten widok nie dodaje osobnego statusu CLI.
- Uszkodzony plik partii blokuje odczyt z komunikatem o archiwum; UI nie przedstawia danych z pamięci jako aktualnych.

## 📝 Risks & Impact Review

Nowy odczyt jest addytywny. `owner_attested` nie znaczy potwierdzenia EODHD ani GPW. API zwraca krótką referencję dowodu z walidowanego pliku, bez pełnej ścieżki i treści dokumentu. Cofnięcie widoku nie zmienia archiwum ani migawek.

## 📝 Decisions in play

R01: datowane tożsamości i dowody. D07: pełna historia GPW nie jest warunkiem tego widoku. N01, N02 i wyłączenie składowych indeksów bez zmian. Zaakceptowany import lokalnego pliku pozostaje sposobem publikacji mapy.

## 📋 Phasing

1. Paginowany odczyt aktywnej i zachowanej partii.
2. Widok powiązanych i nierozstrzygniętych na `/data`.

## 📋 Implementation Plan

1. Dodać endpoint listy z walidacją partii i kursora; sprawdzić wiele okresów, pustą partię, zmianę head, nieznaną partię i uszkodzony plik. Dotychczasowe API nadal działa.
2. Dodać sekcję Angular; sprawdzić przejście między stronami, zmianę aktywnej partii oraz obsługę klawiaturą w działającej aplikacji.
