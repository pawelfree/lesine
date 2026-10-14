import { Injectable } from '@nestjs/common';
import {
  AdvisorReportParseResult,
  ParsedAdvisorReport,
  PortfolioHolding,
  SentimentRating,
} from './advisor-report.types';

type SectionKey =
  'portfolio' | 'decisions' | 'sentiment' | 'threeCompanies' | 'growthStocks';

const SECTIONS: { key: SectionKey; label: string; pattern: RegExp }[] = [
  { key: 'portfolio', label: 'Skład portfela', pattern: /^skład portfela:?$/i },
  {
    key: 'decisions',
    label: 'Decyzje i komentarz',
    pattern: /^decyzje i komentarz:?$/i,
  },
  {
    key: 'sentiment',
    label: 'Ocena sentymentu',
    pattern: /^ocena sentymentu:?$/i,
  },
  {
    key: 'threeCompanies',
    label: '3 spółki na 3 miesiące',
    pattern: /^3 spółki na 3 miesiące:?$/i,
  },
  {
    key: 'growthStocks',
    label: 'Spółki prowzrostowe tygodnia',
    pattern: /^spółki prowzrostowe tygodnia:?$/i,
  },
];

const HOLDING_LINE = /^-\s*(.+?)\s*\(([^)]+)\)\s*[—-]\s*(\d+(?:[.,]\d+)?)%\s*$/;
const SENTIMENT_LINE = /^(.+?):\s*(.+)$/;
const GROWTH_STOCK_LINE = /^-\s*(.+)$/;

const SENTIMENT_CATEGORIES: Record<string, SentimentRating> = {
  'bardzo negatywna': 'bardzo-negatywna',
  negatywna: 'negatywna',
  'umiarkowanie negatywna': 'umiarkowanie-negatywna',
  neutralna: 'neutralna',
  'umiarkowanie pozytywna': 'umiarkowanie-pozytywna',
  pozytywna: 'pozytywna',
  'bardzo pozytywna': 'bardzo-pozytywna',
};

function parseHoldingLine(line: string): PortfolioHolding | null {
  const match = HOLDING_LINE.exec(line);
  if (!match) {
    return null;
  }
  return {
    name: match[1],
    ticker: match[2],
    weightPercent: parseFloat(match[3].replace(',', '.')),
  };
}

function addHolding(
  line: string,
  target: PortfolioHolding[],
  warnings: string[],
  sectionLabel: string,
): void {
  const holding = parseHoldingLine(line);
  if (holding) {
    target.push(holding);
  } else {
    warnings.push(
      `Could not parse a holding line in "${sectionLabel}": "${line}"`,
    );
  }
}

function addSentiment(
  line: string,
  target: Record<string, SentimentRating>,
  warnings: string[],
): void {
  const match = SENTIMENT_LINE.exec(line);
  if (!match) {
    warnings.push(`Could not parse a sentiment line: "${line}"`);
    return;
  }
  const market = match[1].trim();
  const category = SENTIMENT_CATEGORIES[match[2].trim().toLowerCase()];
  if (!category) {
    warnings.push(
      `Unrecognized sentiment rating for market "${market}": "${match[2]}"`,
    );
    return;
  }
  target[market] = category;
}

function addGrowthStock(
  line: string,
  target: string[],
  warnings: string[],
): void {
  const match = GROWTH_STOCK_LINE.exec(line);
  if (!match) {
    warnings.push(`Could not parse a growth-stock line: "${line}"`);
    return;
  }
  target.push(match[1]);
}

/**
 * Pure text-to-structured-data parser for the advisor's daily report, per
 * the section headers and line shapes assumed in
 * `.ai/specs/2026-10-14-pdf-extraction-reliability.md` (spec `Q1`,
 * `⚠ NEEDS HUMAN CONFIRMATION` — unconfirmed against a real PDF). A section
 * or line that does not match never fabricates data: it is left out of the
 * result and named in `warnings` instead.
 */
@Injectable()
export class AdvisorReportParserService {
  parse(text: string): AdvisorReportParseResult {
    const report: ParsedAdvisorReport = {
      portfolio: [],
      decisionsCommentary: null,
      sentimentByMarket: {},
      threeCompaniesThreeMonths: [],
      growthStocksOfTheWeek: [],
    };
    const warnings: string[] = [];
    const decisionsLines: string[] = [];
    const foundSections = new Set<SectionKey>();
    let current: SectionKey | null = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      const section = SECTIONS.find((candidate) =>
        candidate.pattern.test(line),
      );
      if (section) {
        current = section.key;
        foundSections.add(section.key);
        continue;
      }

      switch (current) {
        case 'portfolio':
          addHolding(line, report.portfolio, warnings, 'Skład portfela');
          break;
        case 'decisions':
          decisionsLines.push(line);
          break;
        case 'sentiment':
          addSentiment(line, report.sentimentByMarket, warnings);
          break;
        case 'threeCompanies':
          addHolding(
            line,
            report.threeCompaniesThreeMonths,
            warnings,
            '3 spółki na 3 miesiące',
          );
          break;
        case 'growthStocks':
          addGrowthStock(line, report.growthStocksOfTheWeek, warnings);
          break;
        case null:
          break;
      }
    }

    if (decisionsLines.length > 0) {
      report.decisionsCommentary = decisionsLines.join(' ');
    }

    for (const { key, label } of SECTIONS) {
      if (!foundSections.has(key)) {
        warnings.push(`No "${label}" section found`);
      }
    }

    return { report, warnings };
  }
}
