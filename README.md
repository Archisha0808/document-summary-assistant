# Document Summary Assistant

Upload a PDF or a photo of a document and get back a summary, key points,
word count, and reading time. No sign-up, no API key needed to run it.

**Live demo:** https://document-summary-assistant-zga3.onrender.com
**Repo:** https://github.com/Archisha0808/document-summary-assistant

---

## Features

- Drag-and-drop or file-picker upload for PDFs and images (PNG, JPG, WEBP, BMP), up to 15MB
- PDF text extraction via `pdf-parse`, OCR for scanned images via `tesseract.js`
- Short / medium / long summary length, plus auto-extracted key points
- Loading states and clear error messages for bad file types, oversized files, unreadable PDFs, etc.
- Mobile-responsive, no frontend framework or build step

---

## How it works

The app is a single Node/Express service that serves both the API and the
static frontend, so it deploys as one piece.

Text extraction branches on file type: `pdf-parse` reads a PDF's text layer
directly, and images go through `tesseract.js` for OCR. Both feed into an
extractive summarizer I wrote from scratch — it scores each sentence by how
frequently its words appear elsewhere in the document (with a small bonus
for opening sentences), keeps the top-scoring sentences, and puts them back
in their original order.

I went with extractive summarization instead of calling an LLM because it
runs offline, needs no API key, costs nothing per request, and can't
hallucinate — every sentence in the summary is lifted directly from the
source. The trade-off is that it can't paraphrase. `utils/summarizer.js` is
a single `summarize(text, length)` function, so swapping in an LLM-based
summarizer later is a self-contained change.

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

Note: the first time you summarize an image, `tesseract.js` downloads its
English language data (~10-15MB) and caches it. That needs outbound
internet access, and only happens once per environment.

---

## Deployment

Deployed on Render:
- Build command: `npm install`
- Start command: `npm start`
- No environment variables needed

Any Node-friendly host works the same way (Railway, Heroku, etc.) since
it's just a single long-running Node process.

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

Errors come back as `{ "error": "message" }` with status `400` (bad
request), `413` (file too large), `422` (unreadable/empty document), or
`500` (unexpected).

---

## Notes

- Uploads are handled in memory and never written to disk, so nothing
  needs cleaning up and no document content is retained after the response
  is sent.
- A single failed OCR request can't take down the server for other users —
  it's isolated with its own timeout and error handling.
