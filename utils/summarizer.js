/**
 * Lightweight extractive summarizer.
 *
 * Why extractive, and why no external AI API by default:
 *  - It runs fully offline, with zero API keys, zero rate limits, and zero
 *    per-request cost — important for a free-tier deployment.
 *  - It is fast and deterministic, which keeps the UX snappy even on a
 *    small hosting instance.
 *  - It is transparent: every sentence in the summary is a real sentence
 *    lifted from the source document, so it can never "hallucinate" facts.
 *
 * The scoring is a small, well-understood pipeline:
 *   1. Split the document into sentences.
 *   2. Score each word by frequency, ignoring stopwords (word frequency
 *      approximates "importance" in a single document — the same idea
 *      behind classic TF/TF-IDF summarizers).
 *   3. Score each sentence as the average word score of its words, with a
 *      small position bonus (opening sentences tend to carry the most
 *      context in reports, articles, and essays).
 *   4. Take the top-N scoring sentences and re-order them back into their
 *      original document order, so the summary still reads naturally.
 *
 * An optional LLM-backed summarizer can be dropped in later (see
 * README "Extending with an LLM") without changing this module's
 * public interface: summarize(text, length) -> { summary, keyPoints, ... }
 */

const STOPWORDS = new Set(
  (
    'a about above after again against all am an and any are aren\'t as at be because been ' +
    'before being below between both but by can\'t cannot could couldn\'t did didn\'t do does ' +
    'doesn\'t doing don\'t down during each few for from further had hadn\'t has hasn\'t have ' +
    'haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s ' +
    'i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most mustn\'t my ' +
    'myself no nor not of off on once only or other ought our ours ourselves out over own same ' +
    'shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their ' +
    'theirs them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this ' +
    'those through to too under until up very was wasn\'t we we\'d we\'ll we\'re we\'ve were weren\'t ' +
    'what what\'s when when\'s where where\'s which while who who\'s whom why why\'s with won\'t would ' +
    'wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves also however thus ' +
    'therefore may might shall will one two page figure table said says according'
  ).split(' ')
);

const LENGTH_PRESETS = {
  short: { ratio: 0.12, min: 2, max: 4 },
  medium: { ratio: 0.28, min: 4, max: 8 },
  long: { ratio: 0.5, min: 6, max: 14 }
};

function splitSentences(text) {
  // PDF/OCR extraction preserves the source's line-wrap breaks, which do
  // NOT correspond to sentence boundaries (a line can wrap mid-sentence).
  // Collapse all whitespace runs — including single newlines from wrapped
  // lines — down to single spaces before sentence-splitting, so a sentence
  // that happened to wrap across two lines isn't cut in half.
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Split on sentence-ending punctuation followed by whitespace + capital
  // letter/quote, while protecting common abbreviations from splitting.
  const protectedText = cleaned.replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K)\./g,
    (m) => m.replace('.', '§')
  );

  const rawSentences = protectedText
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter((s) => s.length > 0);

  // Merge sentence fragments that are too short to be standalone (likely
  // headings or bullet fragments) into the following sentence.
  const merged = [];
  for (const s of rawSentences) {
    if (merged.length > 0 && s.split(/\s+/).length < 4 && !/[.?!]$/.test(merged[merged.length - 1])) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }
  return merged.filter((s) => s.split(/\s+/).length >= 3);
}

function tokenize(sentence) {
  return (sentence.toLowerCase().match(/[a-z0-9']+/g) || []).filter(
    (w) => w.length > 1 && !STOPWORDS.has(w)
  );
}

function buildWordFrequencies(sentences) {
  const freq = new Map();
  for (const sentence of sentences) {
    for (const word of tokenize(sentence)) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }
  // Normalize by the most frequent word so scores stay in a 0..1 range.
  const max = Math.max(1, ...freq.values());
  for (const [word, count] of freq) freq.set(word, count / max);
  return freq;
}

function scoreSentences(sentences, freq) {
  return sentences.map((sentence, index) => {
    const words = tokenize(sentence);
    const rawScore = words.reduce((sum, w) => sum + (freq.get(w) || 0), 0);
    const avgScore = words.length ? rawScore / words.length : 0;
    const positionBonus = index === 0 ? 0.15 : index < 3 ? 0.08 : 0;
    const lengthPenalty = words.length < 4 ? 0.4 : 1;
    return {
      index,
      sentence,
      score: (avgScore + positionBonus) * lengthPenalty
    };
  });
}

function pickSentenceCount(totalSentences, length) {
  const preset = LENGTH_PRESETS[length] || LENGTH_PRESETS.medium;
  const target = Math.round(totalSentences * preset.ratio);
  return Math.max(preset.min, Math.min(preset.max, target, totalSentences));
}

function extractKeyPoints(freq, count = 6) {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

function estimateReadingTimeMinutes(wordCount, wpm = 200) {
  return Math.max(1, Math.round(wordCount / wpm));
}

function summarize(text, length = 'medium') {
  const sentences = splitSentences(text);

  if (sentences.length === 0) {
    return {
      summary: '',
      keyPoints: [],
      sentenceCount: 0,
      wordCount: 0,
      readingTimeMinutes: 0
    };
  }

  const freq = buildWordFrequencies(sentences);
  const scored = scoreSentences(sentences, freq);
  const count = pickSentenceCount(sentences.length, length);

  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, count);
  const orderedSummary = top
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence)
    .join(' ');

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    summary: orderedSummary,
    keyPoints: extractKeyPoints(freq, 6),
    sentenceCount: sentences.length,
    summarySentenceCount: top.length,
    wordCount,
    readingTimeMinutes: estimateReadingTimeMinutes(wordCount)
  };
}

module.exports = { summarize, splitSentences };
