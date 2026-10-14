import { readFileSync } from 'fs';
import { join } from 'path';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'minimal-report.pdf');

describe('PdfTextExtractorService', () => {
  let service: PdfTextExtractorService;

  beforeEach(() => {
    service = new PdfTextExtractorService();
  });

  it('extracts the text content of a real PDF', async () => {
    const buffer = readFileSync(FIXTURE_PATH);

    const text = await service.extractText(buffer);

    expect(text).toContain('Raport dzienny');
  });

  it('rejects when the buffer is not a valid PDF', async () => {
    const buffer = Buffer.from('this is not a pdf');

    await expect(service.extractText(buffer)).rejects.toThrow();
  });
});
