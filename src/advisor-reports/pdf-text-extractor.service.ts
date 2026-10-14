import { Injectable } from '@nestjs/common';
import { inflateSync } from 'zlib';

const PDF_HEADER = '%PDF-';
const STREAM_START = /stream\r?\n/g;
// A PDF string token is either a literal `(...)` (with `\`-escapes) or a hex
// string `<...>`. Both forms are valid operands of `Tj`/`TJ`.
const STRING_TOKEN_SOURCE = '\\(((?:\\\\.|[^\\\\)])*)\\)|<([0-9A-Fa-f\\s]*)>';
const SHOW_TEXT_OPERATOR = new RegExp(`(?:${STRING_TOKEN_SOURCE})\\s*Tj`, 'g');
const SHOW_TEXT_ARRAY_OPERATOR = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
const ARRAY_STRING = new RegExp(STRING_TOKEN_SOURCE, 'g');
const LINE_BREAK_OPERATOR = /\b(?:Td|TD|T\*)\b/g;

function unescapeLiteralString(raw: string): string {
  return raw.replace(
    /\\(n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g,
    (_match, code: string) => {
      switch (code) {
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'b':
          return '\b';
        case 'f':
          return '\f';
        case '(':
          return '(';
        case ')':
          return ')';
        case '\\':
          return '\\';
        default:
          return String.fromCharCode(parseInt(code, 8));
      }
    },
  );
}

function decodeHexString(hex: string): string {
  const digits = hex.replace(/\s+/g, '');
  let text = '';
  for (let i = 0; i < digits.length - 1; i += 2) {
    text += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
  }
  return text;
}

/** Decodes a matched literal (`group1`) or hex (`group2`) string token. */
function decodeStringToken(
  literal: string | undefined,
  hex: string | undefined,
): string {
  if (literal !== undefined) {
    return unescapeLiteralString(literal);
  }
  return decodeHexString(hex as string);
}

/**
 * Extracts the text shown by `Tj`/`TJ` operators from a single decompressed
 * PDF content stream, inserting a line break at each line-positioning
 * operator so rows stay distinguishable in the output.
 */
function extractShownText(content: string): string {
  const breakPositions = new Set<number>();
  for (const match of content.matchAll(LINE_BREAK_OPERATOR)) {
    breakPositions.add(match.index);
  }

  const pieces: { index: number; text: string }[] = [];

  for (const match of content.matchAll(SHOW_TEXT_OPERATOR)) {
    pieces.push({
      index: match.index,
      text: decodeStringToken(match[1], match[2]),
    });
  }

  for (const match of content.matchAll(SHOW_TEXT_ARRAY_OPERATOR)) {
    const arrayBody = match[1];
    let text = '';
    for (const stringMatch of arrayBody.matchAll(ARRAY_STRING)) {
      text += decodeStringToken(stringMatch[1], stringMatch[2]);
    }
    pieces.push({ index: match.index, text });
  }

  pieces.sort((a, b) => a.index - b.index);
  const breaks = [...breakPositions].sort((a, b) => a - b);

  let result = '';
  let breakCursor = 0;
  for (const piece of pieces) {
    while (breakCursor < breaks.length && breaks[breakCursor] < piece.index) {
      result += '\n';
      breakCursor += 1;
    }
    result += piece.text;
  }

  return result;
}

function decodeStream(dictionary: string, body: Buffer): Buffer | null {
  if (!/\/Filter\s*\/FlateDecode/.test(dictionary)) {
    return body;
  }
  try {
    return inflateSync(body);
  } catch {
    return null;
  }
}

/**
 * Minimal, dependency-free PDF text extractor: locates each `stream` /
 * `endstream` object, inflates `FlateDecode` content (the common case for
 * text-based PDFs produced by standard tools), and reads the `Tj`/`TJ` text
 * show operators out of the decompressed content stream.
 *
 * This intentionally does not depend on a general-purpose PDF library:
 * `pdf-parse`'s bundled pdf.js builds failed to parse valid PDFs reliably
 * under this project's Jest runtime (a module-sandboxing incompatibility
 * with their old webpack bundles), while working fine outside Jest — too
 * fragile for a CI-gated dependency. This only needs to read simple,
 * single-column text reports, not render arbitrary layouts.
 */
@Injectable()
export class PdfTextExtractorService {
  extractText(buffer: Buffer): Promise<string> {
    if (
      buffer.subarray(0, PDF_HEADER.length).toString('latin1') !== PDF_HEADER
    ) {
      return Promise.reject(new Error('Not a valid PDF file'));
    }

    const raw = buffer.toString('latin1');
    const sections: string[] = [];

    STREAM_START.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STREAM_START.exec(raw)) !== null) {
      const dictStart = Math.max(raw.lastIndexOf('<<', match.index), 0);
      const dictionary = raw.slice(dictStart, match.index);
      const bodyStart = match.index + match[0].length;
      const bodyEnd = raw.indexOf('endstream', bodyStart);
      if (bodyEnd === -1) {
        continue;
      }

      const bodyBuffer = buffer.subarray(bodyStart, bodyEnd);
      const decoded = decodeStream(dictionary, bodyBuffer);
      if (!decoded) {
        continue;
      }

      sections.push(extractShownText(decoded.toString('latin1')));
    }

    return Promise.resolve(sections.join('\n\n'));
  }
}
