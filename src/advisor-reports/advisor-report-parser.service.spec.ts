import { AdvisorReportParserService } from './advisor-report-parser.service';

describe('AdvisorReportParserService', () => {
  let service: AdvisorReportParserService;

  beforeEach(() => {
    service = new AdvisorReportParserService();
  });

  it('parses a fully recognized report with no warnings', () => {
    const text = `
Raport dzienny — 2026-10-14

Skład portfela:
- PKN Orlen (PKN) — 12%

Decyzje i komentarz:
Dzisiaj zwiększamy pozycję w PKN Orlen.
Marże rafineryjne rosną.

Ocena sentymentu:
GPW: Umiarkowanie pozytywna

3 spółki na 3 miesiące:
- Dino Polska (DNP) — 40%

Spółki prowzrostowe tygodnia:
- Asseco Poland (ACP)
`;

    const { report, warnings } = service.parse(text);

    expect(report.portfolio).toEqual([
      { name: 'PKN Orlen', ticker: 'PKN', weightPercent: 12 },
    ]);
    expect(report.decisionsCommentary).toBe(
      'Dzisiaj zwiększamy pozycję w PKN Orlen. Marże rafineryjne rosną.',
    );
    expect(report.sentimentByMarket).toEqual({ GPW: 'umiarkowanie-pozytywna' });
    expect(report.threeCompaniesThreeMonths).toEqual([
      { name: 'Dino Polska', ticker: 'DNP', weightPercent: 40 },
    ]);
    expect(report.growthStocksOfTheWeek).toEqual(['Asseco Poland (ACP)']);
    expect(warnings).toEqual([]);
  });

  it('warns about every missing section and leaves the report empty', () => {
    const { report, warnings } = service.parse('Nothing recognizable here.');

    expect(report.portfolio).toEqual([]);
    expect(report.decisionsCommentary).toBeNull();
    expect(report.sentimentByMarket).toEqual({});
    expect(report.threeCompaniesThreeMonths).toEqual([]);
    expect(report.growthStocksOfTheWeek).toEqual([]);
    expect(warnings).toEqual([
      'No "Skład portfela" section found',
      'No "Decyzje i komentarz" section found',
      'No "Ocena sentymentu" section found',
      'No "3 spółki na 3 miesiące" section found',
      'No "Spółki prowzrostowe tygodnia" section found',
    ]);
  });

  it('warns when a portfolio holding line cannot be parsed', () => {
    const text = 'Skład portfela:\nnot a holding line';

    const { report, warnings } = service.parse(text);

    expect(report.portfolio).toEqual([]);
    expect(warnings).toContain(
      'Could not parse a holding line in "Skład portfela": "not a holding line"',
    );
  });

  it('warns when a 3-companies-3-months holding line cannot be parsed', () => {
    const text = '3 spółki na 3 miesiące:\nnot a holding line';

    const { report, warnings } = service.parse(text);

    expect(report.threeCompaniesThreeMonths).toEqual([]);
    expect(warnings).toContain(
      'Could not parse a holding line in "3 spółki na 3 miesiące": "not a holding line"',
    );
  });

  it('warns and omits an unrecognized sentiment rating instead of guessing', () => {
    const text = 'Ocena sentymentu:\nDAX: Bardzo dziwna ocena';

    const { report, warnings } = service.parse(text);

    expect(report.sentimentByMarket).toEqual({});
    expect(warnings).toContain(
      'Unrecognized sentiment rating for market "DAX": "Bardzo dziwna ocena"',
    );
  });

  it('warns when a sentiment line has no market/rating separator', () => {
    const text = 'Ocena sentymentu:\njust some words';

    const { report, warnings } = service.parse(text);

    expect(report.sentimentByMarket).toEqual({});
    expect(warnings).toContain(
      'Could not parse a sentiment line: "just some words"',
    );
  });

  it('warns when a growth-stock line is malformed', () => {
    const text = 'Spółki prowzrostowe tygodnia:\nnot a list item';

    const { report, warnings } = service.parse(text);

    expect(report.growthStocksOfTheWeek).toEqual([]);
    expect(warnings).toContain(
      'Could not parse a growth-stock line: "not a list item"',
    );
  });
});
