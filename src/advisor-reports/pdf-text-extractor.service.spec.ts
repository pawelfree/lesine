import { readFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';
import { PdfTextExtractorService } from './pdf-text-extractor.service';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'minimal-report.pdf');

function pdfWithStream(streamBody: string, dictionary = ''): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< ${dictionary} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
    'latin1',
  );
}

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

    await expect(service.extractText(buffer)).rejects.toThrow(
      'Not a valid PDF file',
    );
  });

  it('decodes a literal-string Tj with escape sequences from an uncompressed stream', async () => {
    const content =
      'BT\n(Line \\101 one \\( \\) \\\\ \\n\\r\\t\\b\\f) Tj\nTd\n(Line two) Tj\nTd\nET';
    const buffer = pdfWithStream(content, '/Length 10');

    const text = await service.extractText(buffer);

    expect(text).toBe('Line A one ( ) \\ \n\r\t\b\f\nLine two');
  });

  it('decodes a TJ array mixing literal and hex strings with kerning numbers', async () => {
    const content = 'BT\n[(Hello) -20 ( world) 5 <2E>] TJ\nET';
    const buffer = pdfWithStream(content, '/Length 10');

    const text = await service.extractText(buffer);

    expect(text).toBe('Hello world.');
  });

  it('skips a stream declared as FlateDecode that cannot be inflated', async () => {
    const buffer = pdfWithStream(
      'not-zlib-data',
      '/Filter /FlateDecode /Length 13',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('');
  });

  it('ignores a stream with no closing endstream marker', async () => {
    const buffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Length 1 >>\nstream\n(unterminated) Tj\n',
      'latin1',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('');
  });

  it('joins text from multiple content streams in the same document', async () => {
    const compressed = deflateSync(Buffer.from('BT\n(First) Tj\nET', 'latin1'));
    const buffer = Buffer.concat([
      Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n',
        'latin1',
      ),
      compressed,
      Buffer.from(
        '\nendstream\nendobj\n2 0 obj\n<< /Length 1 >>\nstream\n(Second) Tj\nendstream\nendobj\n',
        'latin1',
      ),
    ]);

    const text = await service.extractText(buffer);

    expect(text).toBe('First\n\nSecond');
  });
});
