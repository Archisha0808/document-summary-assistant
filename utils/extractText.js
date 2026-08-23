const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

const PDF_TYPES = new Set(['application/pdf']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp']);

class ExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractionError';
  }
}

async function extractFromPdf(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (err) {
    throw new ExtractionError('Could not read this PDF. It may be corrupted or password-protected.');
  }
}

const OCR_TIMEOUT_MS = 60_000;

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ExtractionError(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function extractFromImage(buffer) {
  // Tesseract.recognize() can occasionally reject in ways that also emit an
  // unhandled rejection on the worker thread (e.g. a failed language-data
  // fetch). Isolating the call in its own promise chain, plus the
  // process-level safety net in server.js, keeps one bad OCR request from
  // taking the whole server down for other users.
  try {
    const recognition = Tesseract.recognize(buffer, 'eng').catch((err) => {
      throw new ExtractionError(
        'Could not run OCR on this image. Try a clearer scan, or check your network connection — ' +
          'OCR needs to download its language data on first use.'
      );
    });
    const { data } = await withTimeout(
      recognition,
      OCR_TIMEOUT_MS,
      'OCR took too long and timed out. Try a smaller or clearer image.'
    );
    return (data.text || '').trim();
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError('Could not run OCR on this image. Try a clearer scan or a higher-resolution photo.');
  }
}

/**
 * Extracts raw text from an uploaded file buffer based on its MIME type.
 * Supports PDF (direct text layer) and common image formats (via OCR).
 */
async function extractText(file) {
  const { buffer, mimetype } = file;

  let text;
  let method;

  if (PDF_TYPES.has(mimetype)) {
    text = await extractFromPdf(buffer);
    method = 'pdf-text';
  } else if (IMAGE_TYPES.has(mimetype)) {
    text = await extractFromImage(buffer);
    method = 'ocr';
  } else {
    throw new ExtractionError('Unsupported file type. Please upload a PDF or an image (PNG, JPG, WEBP).');
  }

  if (!text || text.trim().length < 20) {
    throw new ExtractionError(
      method === 'ocr'
        ? 'No readable text was found in this image. Try a sharper scan with good lighting.'
        : 'No readable text was found in this PDF. It may be a scanned image — try uploading it as an image file instead.'
    );
  }

  return { text, method };
}

module.exports = { extractText, ExtractionError };
