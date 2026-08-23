# Document Summary Assistant

Upload a PDF or a photo/scan of a document and get back an adjustable-length
summary, key points, word count, and reading time — no sign-up, no API key
required to run it locally.

   **Live demo:** https://document-summary-assistant-zga3.onrender.com
   **Repo:** https://github.com/Archisha0808/document-summary-assistant

![Node](https://img.shields.io/badge/node-%3E%3D18-informational)

---

## Features

- **Drag-and-drop or file-picker upload** for PDFs and images (PNG, JPG, WEBP, BMP), up to 15MB.
- **Text extraction**
  - PDFs: text-layer extraction with `pdf-parse`.
  - Images (scanned documents): OCR with `tesseract.js` (Tesseract under the hood).
- **Summary generation** with a **short / medium / long** length toggle, plus a
  handful of auto-extracted **key points** (top keywords by importance).
- **Loading states** with staged status messages, and **clear, specific error
  messages** for bad file types, oversized files, unreadable PDFs, and images
  with no legible text.
- **Mobile-responsive**, dependency-light UI (no frontend framework, no build step).

---

## Approach (≤200 words)

I built this as a single Node/Express app that serves a static frontend and
exposes one endpoint, `POST /api/summarize`, so the whole thing deploys as
one service — no separate frontend host, no CORS juggling.

Text extraction branches on MIME type: `pdf-parse` reads the PDF's text
layer directly; images go through `tesseract.js` for OCR. Both paths funnel
into a single extractive summarizer I wrote from scratch: it scores each
sentence by the frequency of its non-stopword words (classic TF scoring)
plus a small bonus for opening sentences, then keeps the top-scoring
sentences — reordered back into their original sequence — for the requested
length. Key points are just the highest-frequency non-stopword terms.

I chose extractive summarization over calling a hosted LLM on purpose: it
runs fully offline, has no API key or rate limit to manage, costs nothing
per request, and can never hallucinate a fact, since every summary sentence
is lifted verbatim from the source. The trade-off is fluency — it can't
paraphrase — which I documented in code as an intentional choice, with a
clear extension point (see below) if a more abstractive summary is wanted later.

---

## Project structure

```
document-summary-assistant/
├── server.js              # Express app: routes, upload handling, error middleware
├── utils/
│   ├── extractText.js     # PDF text extraction + image OCR
│   └── summarizer.js      # Dependency-free extractive summarizer
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
git clone <your-repo-url>
cd document-summary-assistant
npm install
npm start
```

Open **http://localhost:3000**.

> **Note on OCR:** the first time you summarize an image, `tesseract.js`
> downloads its English language data (~10-15MB) from its CDN and caches it.
> This requires outbound internet access on whatever machine runs the
> server. It's a one-time download per environment, not per request.

---

## Deployment

This is a single Node service (backend + static frontend together), so any
Node-friendly host works. Two straightforward options:

**Render / Railway (recommended — free tier, persistent Node process)**
1. Push this repo to GitHub.
2. Create a new **Web Service**, connect the repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Done — Render/Railway assigns a public URL.

**Vercel**
- Works too, but Vercel's serverless functions are best suited to short PDF
  requests; OCR can be slow on cold starts since `tesseract.js` needs to
  fetch language data per cold instance. Render/Railway (a long-running
  process) is the smoother fit for this app.

No environment variables are required for the default setup.

---

## API

### `POST /api/summarize`

`multipart/form-data` with:

| Field      | Type   | Required | Notes                                  |
|------------|--------|----------|-----------------------------------------|
| `document` | file   | yes      | PDF or image, ≤15MB                     |
| `length`   | string | no       | `short` \| `medium` \| `long` (default `medium`) |

**Response `200`**
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

**Error responses** use `{ "error": "message" }` with status `400` (bad
request), `413` (file too large), `422` (unreadable/empty document), or
`500` (unexpected).

---

## Design notes

- **Dependencies stay minimal**, per the assignment's package guidelines:
  `express`, `multer`, `cors`, `pdf-parse`, `tesseract.js` on the backend;
  zero dependencies on the frontend (plain HTML/CSS/JS).
- **No file persistence** — uploads are handled in memory (`multer`'s
  memory storage) and never written to disk, so nothing needs cleaning up
  and no document content is retained after the response is sent.
- **Robustness:** a request-level try/catch on every route, specific error
  messages per failure mode (bad type, oversized, unreadable, empty), and a
  process-level safety net so a single failed OCR job can't crash the
  server for other users.

### Extending with an LLM (optional)

`utils/summarizer.js` exports a single `summarize(text, length)` function.
To swap in an abstractive, LLM-generated summary instead of (or in addition
to) the extractive one, replace its body with a call to any provider's
completion endpoint using the extracted `text`, and keep the same return
shape (`{ summary, keyPoints, wordCount, readingTimeMinutes }`) so the rest
of the app — routes, frontend, error handling — needs no changes.

---

## Checklist (per submission guidelines)

- [x] App runs without errors (`npm install && npm start`)
- [x] No `node_modules`, `.env`, build artifacts, or editor files committed (`.gitignore`)
- [x] Minimal, necessary dependencies only
- [x] Clean file structure, commented where it matters
- [x] Loading states and specific error handling throughout
- [x] Mobile-responsive UI
