# Document Summary Assistant

Upload a PDF or a photo of a document and get back a summary, key points, word count, and reading time. No sign-up, no API key needed.

**Live demo:** https://document-summary-assistant-zga3.onrender.com
**Repo:** https://github.com/Archisha0808/document-summary-assistant

---

## Features

- Drag-and-drop or file-picker upload for PDFs and images (PNG, JPG, WEBP, BMP), up to 15MB
- PDF text extraction with `pdf-parse`, OCR for scanned images with `tesseract.js`
- Short / medium / long summary length, plus a few auto-extracted key points
- Loading states and error messages for bad file types, oversized files, unreadable PDFs, and images with no legible text
- Mobile-responsive, no frontend framework or build step

---

## How it works

It's a single Node/Express app that serves both the API and the static frontend, so there's just one thing to deploy — no separate frontend host, no CORS to deal with.

Text extraction depends on the file type: `pdf-parse` reads a PDF's text layer directly, and images go through `tesseract.js` for OCR. Both feed into a summarizer I wrote myself, which scores each sentence based on how often its words show up elsewhere in the document, gives opening sentences a small boost, and keeps the top-scoring sentences in their original order. Key points are just the most frequent non-filler words in the text.

I went with this extractive approach instead of calling an LLM because it runs offline, doesn't need an API key, costs nothing per request, and can't make anything up — every sentence in the summary comes straight from the source document. The downside is it can't paraphrase or rephrase anything, which is a fair trade-off for something meant to run for free with no external dependencies. If you wanted to swap in an LLM later, `utils/summarizer.js` is a single `summarize(text, length)` function, so it's a self-contained change.

---

## Project structure

```
document-summary-assistant/
├── server.js              # Express app: routes, upload handling, error middleware
├── utils/
│   ├── extractText.js     # PDF text extraction + image OCR
│   └── summarizer.js      # Extractive summarizer
├── public/                # Static frontend (no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
└── .gitignore
```

---

## Running locally

Requires Node.js 18+.

```bash
git clone https://github.com/Archisha0808/document-summary-assistant.git
cd document-summary-assistant
npm install
npm start
```

Open http://localhost:3000.

One thing to know: the first time you summarize an image, `tesseract.js` downloads its English language data (about 10-15MB) and caches it. That needs an internet connection on whatever machine is running the server, but it's a one-time thing, not per request.

---

## Deployment

This app is deployed on Render:
- Build command: `npm install`
- Start command: `npm start`
- No environment variables needed

It would work the same way on Railway or Heroku since it's just a single long-running Node process. Vercel's serverless functions can work too, but OCR gets slow on cold starts since the language data has to be fetched fresh each time, so a regular server host is a better fit here.

---

## API

### `POST /api/summarize`

`multipart/form-data` with:

| Field      | Type   | Required | Notes                                  |
|------------|--------|----------|-----------------------------------------|
| `document` | file   | yes      | PDF or image, ≤15MB                     |
| `length`   | string | no       | `short` \| `medium` \| `long` (default `medium`) |

**Response**
```json
{
  "fileName": "report.pdf",
  "extractionMethod": "pdf-text",
  "length": "medium",
  "extractedText": "...",
  "summary": "...",
  "keyPoints": ["Revenue", "Growth", "..."],
  "sentenceCount": 42,
  "summarySentenceCount": 8,
  "wordCount": 850,
  "readingTimeMinutes": 4
}
```

Errors come back as `{ "error": "message" }` with a status code: `400` for a bad request, `413` if the file's too large, `422` if the document is unreadable or empty, `500` for anything unexpected.

---

## A few other notes

Uploads are handled entirely in memory and never touch disk, so there's nothing to clean up and no document content sticks around after the response goes out.

I also added a bit of error isolation around the OCR step — a failed OCR request (like a language-data download timing out) won't take the whole server down for everyone else using it at the same time.
