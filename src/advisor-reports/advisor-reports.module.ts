import { Module } from '@nestjs/common';
import { AdvisorReportsController } from './advisor-reports.controller';
import { AdvisorReportParserService } from './advisor-report-parser.service';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

@Module({
  controllers: [AdvisorReportsController],
  providers: [PdfTextExtractorService, AdvisorReportParserService],
})
export class AdvisorReportsModule {}
