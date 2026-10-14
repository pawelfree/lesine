export type SentimentRating =
  | 'bardzo-negatywna'
  | 'negatywna'
  | 'umiarkowanie-negatywna'
  | 'neutralna'
  | 'umiarkowanie-pozytywna'
  | 'pozytywna'
  | 'bardzo-pozytywna';

export interface PortfolioHolding {
  name: string;
  ticker: string;
  weightPercent: number;
}

export interface ParsedAdvisorReport {
  portfolio: PortfolioHolding[];
  decisionsCommentary: string | null;
  sentimentByMarket: Record<string, SentimentRating>;
  threeCompaniesThreeMonths: PortfolioHolding[];
  growthStocksOfTheWeek: string[];
}

export interface AdvisorReportParseResult {
  report: ParsedAdvisorReport;
  warnings: string[];
}
