(() => {
  'use strict';

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const dropzoneIdle = document.getElementById('dropzoneIdle');
  const dropzoneFile = document.getElementById('dropzoneFile');
  const fileNameEl = document.getElementById('fileName');
  const fileSizeEl = document.getElementById('fileSize');
  const removeFileBtn = document.getElementById('removeFile');

  const lengthTabs = Array.from(document.querySelectorAll('.length-tab'));
  const summarizeBtn = document.getElementById('summarizeBtn');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

  const loadingCard = document.getElementById('loadingCard');
  const loadingMessage = document.getElementById('loadingMessage');
  const resultsSection = document.getElementById('results');
  const uploaderSection = document.getElementById('uploader');

  const metaFile = document.getElementById('metaFile');
  const metaMethod = document.getElementById('metaMethod');
  const metaWords = document.getElementById('metaWords');
  const metaReading = document.getElementById('metaReading');
  const keyPointsList = document.getElementById('keyPoints');
  const summaryText = document.getElementById('summaryText');
  const extractedText = document.getElementById('extractedText');
  const copySummaryBtn = document.getElementById('copySummary');
  const startOverBtn = document.getElementById('startOver');

  const MAX_FILE_SIZE_MB = 15;
  const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp'];

  let selectedFile = null;
  let selectedLength = 'short';
  let loadingTimer = null;

  // ---------- Helpers ----------

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extensionOf(fileName) {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorMessage.textContent = '';
  }

  function resetFile() {
    selectedFile = null;
    fileInput.value = '';
    dropzoneIdle.hidden = false;
    dropzoneFile.hidden = true;
    summarizeBtn.disabled = true;
  }

  function setFile(file) {
    clearError();
    const ext = extensionOf(file.name);

    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      showError(`"${file.name}" isn't a supported type. Please upload a PDF or an image (PNG, JPG, WEBP, BMP).`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showError(`"${file.name}" is too large. Please upload a file under ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    dropzoneIdle.hidden = true;
    dropzoneFile.hidden = false;
    summarizeBtn.disabled = false;
  }

  // ---------- Dropzone interactions ----------

  dropzone.addEventListener('click', (e) => {
    if (e.target === removeFileBtn) return;
    if (!selectedFile) fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !selectedFile) {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setFile(file);
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFile();
  });

  // ---------- Length selector ----------

  lengthTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      lengthTabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-checked', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-checked', 'true');
      selectedLength = tab.dataset.length;
    });
  });

  // ---------- Staged loading messages ----------

  const STAGE_MESSAGES = [
    'Reading your document\u2026',
    'Pulling out the text\u2026',
    'Scoring the key sentences\u2026',
    'Writing the summary\u2026'
  ];

  function startLoadingStages() {
    let i = 0;
    loadingMessage.textContent = STAGE_MESSAGES[0];
    loadingTimer = setInterval(() => {
      i = (i + 1) % STAGE_MESSAGES.length;
      loadingMessage.textContent = STAGE_MESSAGES[i];
    }, 1400);
  }

  function stopLoadingStages() {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }

  // ---------- Submit ----------

  summarizeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    clearError();

    uploaderSection.hidden = true;
    loadingCard.hidden = false;
    resultsSection.hidden = true;
    startLoadingStages();

    const formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('length', selectedLength);

    try {
      const res = await fetch('/api/summarize', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong while processing your document.');
      }

      renderResults(data);
      uploaderSection.hidden = false;
      loadingCard.hidden = true;
      resultsSection.hidden = false;
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      uploaderSection.hidden = false;
      loadingCard.hidden = true;
      showError(err.message || 'Network error \u2014 please check your connection and try again.');
    } finally {
      stopLoadingStages();
    }
  });

  // ---------- Render results ----------

  function renderResults(data) {
    metaFile.textContent = data.fileName;
    metaMethod.textContent = data.extractionMethod === 'ocr' ? 'OCR (image)' : 'PDF text layer';
    metaWords.textContent = `${data.wordCount.toLocaleString()} words`;
    metaReading.textContent = `${data.readingTimeMinutes} min`;

    keyPointsList.innerHTML = '';
    data.keyPoints.forEach((point) => {
      const li = document.createElement('li');
      li.textContent = point;
      keyPointsList.appendChild(li);
    });

    renderSweepingSummary(data.summary);

    extractedText.textContent = data.extractedText;
  }

  function renderSweepingSummary(summary) {
    summaryText.innerHTML = '';
    // Split into sentences for the staggered highlighter-sweep animation.
    const sentences = summary.match(/[^.!?]+[.!?]*(\s+|$)/g) || [summary];
    sentences.forEach((sentence, i) => {
      const span = document.createElement('span');
      span.className = 'hl';
      span.style.setProperty('--sweep-delay', `${i * 0.18}s`);
      span.textContent = sentence;
      summaryText.appendChild(span);
    });
  }

  copySummaryBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summaryText.textContent);
      copySummaryBtn.textContent = 'Copied';
      setTimeout(() => { copySummaryBtn.textContent = 'Copy'; }, 1500);
    } catch {
      showError('Could not copy to clipboard. Please select and copy the text manually.');
    }
  });

  startOverBtn.addEventListener('click', () => {
    resetFile();
    resultsSection.hidden = true;
    uploaderSection.hidden = false;
    clearError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
