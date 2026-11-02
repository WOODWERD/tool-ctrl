// Read from photo, on this device (TC-R30 to TC-R35). The reader is bundled in vendor/tesseract and loads on first use;
// every path points at this app's own files, so nothing is fetched from anywhere else and the photo never leaves.
const base = (p) => new URL(`vendor/tesseract/${p}`, document.baseURI).href;
const MAX = 2000; // long side in pixels; plenty for printed model names

// Draw the photo at a sensible size. The canvas is the only copy, and it is emptied when reading ends.
async function toCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  return cv;
}

// Returns the lines of text read. onProgress gets 0 to 1.
export async function readPhoto(file, onProgress = () => {}) {
  const { default: T } = await import('./vendor/tesseract/tesseract.esm.min.js');
  const cv = await toCanvas(file);
  let worker;
  try {
    worker = await T.createWorker('eng', 1, {
      workerPath: base('worker.min.js'), corePath: base(''), langPath: base('lang'), workerBlobURL: false, cacheMethod: 'none', gzip: true,
      logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
    });
    const { data } = await worker.recognize(cv);
    return String(data.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
  } finally {
    if (worker) await worker.terminate();
    cv.width = 0; cv.height = 0; // TC-R34: discard the pixels
  }
}
