import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { AdvisorReportParseResult } from './advisor-report.types';
import { AdvisorReportParserService } from './advisor-report-parser.service';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@Controller('admin/advisor-reports')
@UseGuards(BasicAuthGuard)
export class AdvisorReportsController {
  constructor(
    private readonly pdfTextExtractor: PdfTextExtractorService,
    private readonly parser: AdvisorReportParserService,
  ) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async extract(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<AdvisorReportParseResult> {
    if (!file) {
      throw new BadRequestException('A PDF file is required');
    }

    let text: string;
    try {
      text = await this.pdfTextExtractor.extractText(file.buffer);
    } catch {
      throw new BadRequestException(
        'Could not read the uploaded file as a PDF',
      );
    }

    return this.parser.parse(text);
  }
}
