# Interview — Product owner (self), 2026-10-14

- Recent situation or task the person described: receives a daily PDF analysis report from one external investment advisor (not yet integrated into any system). The PDF contains: the advisor's full portfolio composition, the advisor's investment decisions and commentary, a 7-point sentiment rating per market, a separate "3 companies for 3 months" model portfolio, and a weekly "growth stocks of the week" list.
- What they did, step by step: currently reads these PDFs manually; no system today aggregates them, tracks the advisor's performance, or stores the sentiment ratings over time.
- What worked, what did not, and any consequences they described: not asked directly — the gap described is the absence of any structured tracking, not a failure of an existing tool.
- Other approaches they tried and how those worked: not discussed.
- The outcome they were trying to achieve and what happened: wants to (a) measure the advisor's actual effectiveness against a benchmark, and (b) eventually reconstruct the decision rules the advisor appears to follow from the portfolio history. Not yet attempted.
- Verbatim quotes worth keeping (mark each as quote):
  - quote: "dane od doradcy maja forma pdf (codziennego) do analizy ze skladem portfela, decyzjami inwestycyjymi i omentarzami. dodatkowo prowadzi portel 3 spolki na trzy miesiace oraz infornmmacje spolki prowzrostowe tygodnia. mam dostep do tych danych."
  - quote: "jego wskaznik sentymentu to po prostu ocena Bardza Negatuwna, Negatywna, Umiarkowanie negatywna, neutralna, umierkownia pozytywna, pozytywna, bardzo pozytywna"
  - quote: "daje sobie troche czasu na znalezienie odwzorowania jego strategii ale nie osiagniecie zgodnosci po dluzyszym czasie byloby sygnalem do zaniechania tej metody."
  - quote: "podejzewam ze jego sentyment nie opiera sie tylko na rynku akcji ale tez na danych makro ktore trzeba bedzie wyszukiwac w internecie"
  - quote: "wykrycie regol moze byc kolejnym krokiem podobnie jak tworzenie i testowanie wlasnych strategii"
  - quote: "w przyszlosci planuje tez dane innych doradcow w podobnym zakresie"
- What they explicitly did not care about: beating the benchmark with the team's own hardcoded reference strategies (momentum, low-volatility, etc.) right now — "nie spodziewam sie ze pierwsze strategie pobija cokolwiek"; rule/strategy reconstruction and own-strategy backtesting explicitly pushed to a later step, not MVP.
- Interviewer's own remarks (kept separate from what was said): "a longer period" for the strategy-reconstruction kill criterion was not quantified — left as an open question. No stated depth of historical PDF archive (how far back data is available) — left as an open question, non-blocking for starting the pipeline going forward.

## Follow-up, same session — benchmark and data sources

- quote: "benchamrkeim dla tego doradcy bedzie WIG20 zakladam ze jest dostepny w internecie albo w EODHD lub w innym miejscu (mam tez dostep do aplikacji myfund ale nie wiem czy ma api z pewnoscia mozna uzyc web scrapingu mozna tez pobrac rozmaite dane przy pomocy csv sa tam tez inne ciekawe informacje pewnie mozesz przeczytac informacje z dokumentacji) archiwum spoleg gpw pobierzemy z eodhd, rekomendacje sprawdze ale generuje je co najmniej od 2 lat"
- Decisions in that account: benchmark = WIG20; GPW company price history from EODHD (recorded as D05).
- Facts in that account: the owner has access to the "myfund" app — API availability unknown, CSV export available, other data present there is unspecified; the advisor has been issuing recommendations for at least 2 years, though the owner said he still needs to check his own saved archive.
- Interviewer's own remarks: "myfund" is not decided as a data source — recorded as an open collection-plan item, not a commitment.
