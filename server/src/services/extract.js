import fs from 'node:fs/promises';
import { normalizeWhitespace } from './chunker.js';

export class ExtractionError extends Error {}

// Don't try to retry things that will never work (a corrupt file stays corrupt).
export const isPermanent = (err) => err instanceof ExtractionError;

const MIN_CHARS_PER_PAGE = 20; // below this on average we treat a PDF as image-only

/** @returns {{pages: {pageNumber: number|null, text: string}[], pageCount: number|null}} */
export async function extractText(filePath, fileType) {
  return fileType === 'pdf' ? extractPdf(filePath) : extractTxt(filePath);
}

async function extractTxt(filePath) {
  const buf = await fs.readFile(filePath);
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1'); // not valid UTF-8, fall back
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!text) throw new ExtractionError('The text file is empty.');
  return { pages: [{ pageNumber: null, text }], pageCount: null };
}

async function extractPdf(filePath) {
  // The "legacy" build runs on plain Node without a browser.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));

  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false, // safer: no dynamic code evaluation for untrusted PDFs
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new ExtractionError('This PDF is password-protected and cannot be read.');
    }
    throw new ExtractionError('This PDF is corrupted or not a valid PDF file.');
  }

  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        text += item.str;
        text += item.hasEOL ? '\n' : item.str ? ' ' : '';
      }
      pages.push({ pageNumber: n, text: normalizeWhitespace(text) });
      page.cleanup();
    }

    const totalChars = pages.reduce((s, p) => s + p.text.length, 0);
    if (totalChars === 0 || totalChars / pdf.numPages < MIN_CHARS_PER_PAGE) {
      throw new ExtractionError(
        'No readable text found. This looks like a scanned (image-only) PDF. OCR is not supported in this version.'
      );
    }
    return { pages, pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}
