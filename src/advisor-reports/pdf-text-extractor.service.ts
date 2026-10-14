import { Injectable } from '@nestjs/common';
import { inflateSync } from 'zlib';

const PDF_HEADER = '%PDF-';
// The negative lookbehind matters: "endstream" contains "stream" as a
// substring, so without it every object is matched twice (once for its own
// "stream" keyword, once inside its closing "endstream") — the second,
// spurious match treats the next object's dictionary/header as if it were
// stream body, corrupting (and duplicating) the extracted text.
const STREAM_START = /(?<!end)stream\r?\n/g;
// Object dictionaries are short; bounding the backward search for the "<<"
// that opens one keeps dictionary lookup O(1) per stream instead of O(file
// size) — real PDFs can have hundreds of streams (fonts, images), and an
// unbounded `lastIndexOf` per stream turns that into O(streams × file size).
const DICTIONARY_LOOKBEHIND = 4096;
// Images and embedded font programs are also commonly FlateDecode-compressed
// and can be far larger, once inflated, than the file itself; their
// dictionaries say so up front, so they are skipped without ever inflating
// or regex-scanning their (irrelevant) body.
const NON_TEXT_STREAM = /\/Subtype\s*\/Image|\/FontFile\d?\b/;
// A PDF string token is either a literal `(...)` (with `\`-escapes) or a hex
// string `<...>`. Both forms are valid operands of `Tj`/`TJ`.
//
// The repetitions below are explicitly bounded (no bare `*`). A real PDF
// text-show string is at most a line of text — a few hundred characters —
// so these limits are generous for genuine content, but the bound matters:
// an unbounded `(?:\\.|[^\\)])*` attempted from every stray "(" or "<" byte
// in binary data it doesn't belong to (an inline image sharing the content
// stream with real text, for instance) scans forward to the end of the
// buffer looking for a closing ")"/">" that isn't there, and does that from
// every such byte — effectively O(n²) on a multi-megabyte stream. Bounding
// the match length caps each failed attempt at the bound instead of the
// remaining buffer size.
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 2000;
const STRING_TOKEN_SOURCE = `\\(((?:\\\\.|[^\\\\)]){0,${MAX_STRING_LENGTH}})\\)|<([0-9A-Fa-f\\s]{0,${MAX_STRING_LENGTH}})>`;
const SHOW_TEXT_OPERATOR = new RegExp(`(?:${STRING_TOKEN_SOURCE})\\s*Tj`, 'g');
const SHOW_TEXT_ARRAY_OPERATOR = new RegExp(
  `\\[((?:\\\\.|[^\\]]){0,${MAX_ARRAY_LENGTH}})\\]\\s*TJ`,
  'g',
);
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
 * Removes inline images (`BI` … `ID` … `EI`) from a content stream before
 * text extraction runs. Their raw sample data sits inline, mixed in with
 * real text operators in the very same stream `NON_TEXT_STREAM` cannot help
 * with (it only catches separately-dictionaried image/font *objects*), and
 * can coincidentally contain long runs of bytes the string-token regexes
 * below try (and fail) to match as text. Uses only `indexOf` — a guaranteed
 * linear scan, no regex involved — so this is safe regardless of content.
 */
function stripInlineImages(content: string): string {
  let result = '';
  let cursor = 0;
  for (;;) {
    const biIndex = content.indexOf('BI', cursor);
    if (biIndex === -1) {
      return result + content.slice(cursor);
    }
    const idIndex = content.indexOf('ID', biIndex);
    const eiIndex = idIndex === -1 ? -1 : content.indexOf('EI', idIndex);
    if (idIndex === -1 || eiIndex === -1) {
      return result + content.slice(cursor);
    }
    result += content.slice(cursor, biIndex);
    cursor = eiIndex + 2;
  }
}

/**
 * Extracts the text shown by `Tj`/`TJ` operators from a single decompressed
 * PDF content stream, inserting a line break at each line-positioning
 * operator so rows stay distinguishable in the output.
 */
function extractShownText(rawContent: string): string {
  const content = stripInlineImages(rawContent);

  // Cheap substring search before the regex passes below: a real content
  // stream showing text always contains a literal "Tj"/"TJ", while an
  // image or embedded-font stream (also FlateDecode, often much larger once
  // inflated) essentially never does. Skipping those avoids running several
  // full-content regex scans over megabytes of unrelated binary data.
  if (!content.includes('Tj') && !content.includes('TJ')) {
    return '';
  }

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
      const lookbehindStart = Math.max(match.index - DICTIONARY_LOOKBEHIND, 0);
      const lookbehind = raw.slice(lookbehindStart, match.index);
      const relativeDictStart = lookbehind.lastIndexOf('<<');
      const dictionary =
        relativeDictStart === -1 ? '' : lookbehind.slice(relativeDictStart);
      const bodyStart = match.index + match[0].length;
      const bodyEnd = raw.indexOf('endstream', bodyStart);
      if (bodyEnd === -1) {
        continue;
      }

      if (NON_TEXT_STREAM.test(dictionary)) {
        continue;
      }

      const bodyBuffer = buffer.subarray(bodyStart, bodyEnd);
      const decoded = decodeStream(dictionary, bodyBuffer);
      if (!decoded) {
        continue;
      }

      const text = extractShownText(decoded.toString('latin1'));
      if (text.length > 0) {
        sections.push(text);
      }
    }

    return Promise.resolve(sections.join('\n\n'));
  }
}
