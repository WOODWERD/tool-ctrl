# Third-party notices

Tool Ctrl distributes these fonts in `site/fonts/`, each under the SIL Open Font License 1.1. The licence texts sit beside the fonts.

| Font | Version | Licence file |
|---|---|---|
| Inter | 4.0 | `site/fonts/LICENSE-Inter-OFL.txt` |
| JetBrains Mono | 5.0.20 (Fontsource build) | `site/fonts/LICENSE-JetBrainsMono-OFL.txt` |

The tool catalog in `site/catalog.js` is shared with Box Ctrl, written by hand for these apps. Product names belong to their makers and identify the tools only.

## Text reading for Read from photo

`site/vendor/tesseract/` holds a copy of these, unchanged except for the removed source map comments, loaded only when a photo is read. All run in the browser; nothing is fetched from elsewhere.

| Part | Version | Licence |
|---|---|---|
| [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract.esm.min.js`, `worker.min.js`) | 7.0.0 | Apache 2.0, `site/vendor/tesseract/LICENSE-tesseract.js.txt` |
| [Tesseract.js core](https://github.com/naptha/tesseract.js-core) (`tesseract-core-*-lstm.wasm.js`), a build of Tesseract OCR | 7.0.0 | Apache 2.0, `site/vendor/tesseract/LICENSE-tesseract.js-core.txt` |
| English model (`lang/eng.traineddata.gz`), from Tesseract's tessdata_best, via `@tesseract.js-data/eng` 1.0.0 | 4.0.0 best_int | Apache 2.0 |

The bundled scripts carry their own notices in `tesseract.min.js.LICENSE.txt` and `worker.min.js.LICENSE.txt`.
