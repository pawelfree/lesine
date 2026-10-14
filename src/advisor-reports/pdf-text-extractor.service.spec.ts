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

  it('does not treat "endstream" as a second, spurious stream start', async () => {
    // "endstream" contains "stream" as a substring. Without the negative
    // lookbehind in STREAM_START, the first object's closing "endstream"
    // is itself read as a second stream start, whose body then spans into
    // the next object — duplicating (or corrupting) the real text.
    const buffer = Buffer.from(
      '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 1 >>\nstream\n(First) Tj\nendstream\nendobj\n' +
        '2 0 obj\n<< /Length 1 >>\nstream\n(Second) Tj\nendstream\nendobj\n',
      'latin1',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('First\n\nSecond');
  });

  it('skips a decoded stream that contains no Tj/TJ text-show operator', async () => {
    const compressed = deflateSync(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const buffer = Buffer.concat([
      Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n',
        'latin1',
      ),
      compressed,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]);

    const text = await service.extractText(buffer);

    expect(text).toBe('');
  });

  it('skips an image stream by its dictionary without decompressing it', async () => {
    const buffer = pdfWithStream(
      'not valid zlib data, never inflated',
      '/Filter /FlateDecode /Subtype /Image /Width 10 /Height 10',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('');
  });

  it('skips an embedded font-program stream by its dictionary', async () => {
    const buffer = pdfWithStream(
      'not valid zlib data, never inflated',
      '/Filter /FlateDecode /Length1 1234 /FontFile2',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('');
  });

  it('treats a stream as having no dictionary when "<<" does not appear within the lookbehind window', async () => {
    const padding = 'x'.repeat(5000);
    const buffer = Buffer.from(
      `%PDF-1.4\n${padding}\nstream\n(Hello) Tj\nendstream\n`,
      'latin1',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('Hello');
  });

  it('stays fast when a document has many large non-text streams', async () => {
    const randomish = Buffer.alloc(200_000);
    for (let i = 0; i < randomish.length; i += 1) {
      randomish[i] = (i * 2654435761) % 256;
    }
    const compressed = deflateSync(randomish);

    const parts = ['%PDF-1.4\n'];
    for (let i = 0; i < 50; i += 1) {
      parts.push(
        `${i} 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      );
      parts.push(compressed.toString('latin1'));
      parts.push('\nendstream\nendobj\n');
    }
    parts.push(
      '51 0 obj\n<< /Length 1 >>\nstream\n(Found me) Tj\nendstream\nendobj\n',
    );
    const buffer = Buffer.from(parts.join(''), 'latin1');

    const start = Date.now();
    const text = await service.extractText(buffer);
    const elapsedMs = Date.now() - start;

    expect(text).toBe('Found me');
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('strips an inline image (BI/ID/EI) sharing a content stream with real text', async () => {
    const junk = '('.repeat(50_000);
    const content = `BT\n(Before) Tj\nET\nBI\n/W 10 /H 10\nID\n${junk}\nEI\n(After) Tj`;
    const buffer = pdfWithStream(content, '/Length 10');

    const start = Date.now();
    const text = await service.extractText(buffer);
    const elapsedMs = Date.now() - start;

    expect(text).toBe('BeforeAfter');
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('leaves content as-is when "BI" has no following "ID"', async () => {
    const buffer = pdfWithStream('(Before) Tj BI no id here', '/Length 10');

    const text = await service.extractText(buffer);

    expect(text).toBe('Before');
  });

  it('leaves content as-is when "BI"/"ID" appear with no following "EI"', async () => {
    const buffer = pdfWithStream(
      '(Before) Tj BI\nID\nno ei here',
      '/Length 10',
    );

    const text = await service.extractText(buffer);

    expect(text).toBe('Before');
  });
});
