const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { extractText, ExtractionError } = require('./utils/extractText');
const { summarize } = require('./utils/summarizer');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE_MB = 15;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ExtractionError('Unsupported file type. Please upload a PDF or an image (PNG, JPG, WEBP).'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/summarize', upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded.' });
  }

  const length = ['short', 'medium', 'long'].includes(req.body.length) ? req.body.length : 'medium';

  try {
    const { text, method } = await extractText(req.file);
    const result = summarize(text, length);

    if (!result.summary) {
      return res.status(422).json({
        error: 'Not enough readable content in this document to generate a summary.'
      });
    }

    res.json({
      fileName: req.file.originalname,
      extractionMethod: method,
      length,
      extractedText: text,
      ...result
    });
  } catch (err) {
    if (err instanceof ExtractionError) {
      return res.status(422).json({ error: err.message });
    }
    console.error('Unexpected error while summarizing:', err);
    res.status(500).json({ error: 'Something went wrong while processing your document. Please try again.' });
  }
});

// Multer / upload-level errors (bad file type, file too large, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof ExtractionError) {
    return res.status(422).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Document Summary Assistant running on http://localhost:${PORT}`);
});

// Safety net: tesseract.js runs OCR on a worker thread and can, in rare
// cases (e.g. a failed language-data download), surface an error outside
// the normal promise chain. Without this handler that error would crash
// the whole process and drop every in-flight request, not just the one
// that triggered it. We log it and keep serving other users.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (request isolated, server still running):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (request isolated, server still running):', err);
});
