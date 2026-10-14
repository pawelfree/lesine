import { Injectable } from '@nestjs/common';
import { join } from 'path';

// pdfjs-dist ships only an ES module build. TypeScript's CommonJS output
// would downlevel a normal `import()` into a `require()` call, which fails
// for an ESM-only package and defeats native ESM loading; the Function
// indirection keeps this a genuine dynamic `import()` at runtime, which
// both plain Node and Jest (given `--experimental-vm-modules`, only needed
// under Jest) can load.
// Not eval of untrusted input: the only "code" built here is the fixed,
// literal `import()` expression below, needed only to stop TypeScript from
// downleveling it.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;

const STANDARD_FONT_DATA_URL = `${join(
  require.resolve('pdfjs-dist/package.json'),
  '..',
  'standard_fonts',
)}/`;

/**
 * Wraps `pdfjs-dist` (the engine behind Firefox's PDF viewer) to turn a PDF
 * buffer into its plain text, page by page. A hand-rolled content-stream
 * parser was tried first and dropped: it cannot correctly decode the
 * embedded/CID-keyed fonts real-world PDFs commonly use (confirmed against
 * an actual user-supplied PDF — it produced unreadable output for most of
 * the document), and every additional edge case it needed (inline images,
 * unbounded match lengths causing a near-hang) was a symptom of the same
 * underlying problem: PDF text layout is exactly what a real parser exists
 * to handle correctly.
 */
@Injectable()
export class PdfTextExtractorService {
  async extractText(buffer: Buffer): Promise<string> {
    const pdfjsLib = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;

    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        // `getTextContent()`'s items are typed as `TextItem | TextMarkedContent`,
        // but a `TextMarkedContent` entry only appears when `includeMarkedContent`
        // is requested (default: false, not passed above), so every item here is
        // always a `TextItem`.
        const content = await page.getTextContent();
        const pageText = (content.items as { str: string }[])
          .map((item) => item.str)
          .join(' ');
        pages.push(pageText);
      }
      return pages.join('\n\n');
    } finally {
      await doc.destroy();
    }
  }
}
