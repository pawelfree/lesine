import { BadRequestException } from '@nestjs/common';
import { AdvisorReportParserService } from './advisor-report-parser.service';
import { AdvisorReportsController } from './advisor-reports.controller';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

describe('AdvisorReportsController', () => {
  function createController(
    extractText: jest.Mock,
    parse: jest.Mock = jest.fn(),
  ) {
    const pdfTextExtractor = {
      extractText,
    } as unknown as PdfTextExtractorService;
    const parser = { parse } as unknown as AdvisorReportParserService;
    return new AdvisorReportsController(pdfTextExtractor, parser);
  }

  function fakeFile(buffer = Buffer.from('%PDF-1.4')): Express.Multer.File {
    return { buffer } as Express.Multer.File;
  }

  it('returns the parsed report for a valid PDF upload', async () => {
    const extractText = jest.fn().mockResolvedValue('raw text');
    const parse = jest
      .fn()
      .mockReturnValue({ report: { portfolio: [] }, warnings: [] });
    const controller = createController(extractText, parse);

    const result = await controller.extract(fakeFile());

    expect(extractText).toHaveBeenCalledWith(expect.any(Buffer));
    expect(parse).toHaveBeenCalledWith('raw text');
    expect(result).toEqual({ report: { portfolio: [] }, warnings: [] });
  });

  it('rejects with 400 when no file is uploaded', async () => {
    const controller = createController(jest.fn());

    await expect(controller.extract(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects with 400 when the uploaded file cannot be parsed as a PDF', async () => {
    const extractText = jest
      .fn()
      .mockRejectedValue(new Error('Not a valid PDF file'));
    const controller = createController(extractText);

    await expect(controller.extract(fakeFile())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
