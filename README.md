# Himanshu Gupta — Reliability Loom Portfolio

A no-build personal portfolio made with semantic HTML, plain CSS, Alpine.js, and vanilla JavaScript.

## Run locally

```bash
python3 serve.py
```

Then open `http://127.0.0.1:8000`. The development server disables browser caching so CSS and JavaScript changes are always reflected after a normal refresh.

If macOS **Reduce Motion** is enabled but you want the full portfolio transitions, open `http://127.0.0.1:8000/?motion=full#home` once. The site remembers that choice for this origin. Use `?motion=system` to return to the operating-system preference.

## Files

- `index.html` — content and structure
- `styles.css` — complete responsive visual system
- `script.js` — reliability-loom canvas, horizontal slide deck, reveals, active navigation, and local time
- `vendor/alpine-3.15.12.min.js` — vendored Alpine.js for offline/static use
- `favicon.svg` — local vector favicon
- `serve.py` — no-cache local development server
- `Himanshu_Gupta_AI_Resume_5plus_Years.docx` — downloadable résumé

The core portfolio remains readable without the canvas animation. Alpine.js is only used for mobile navigation and project switching. Desktop/laptop layouts translate wheel and keyboard input into full-viewport right-to-left scene transitions; smaller screens retain natural vertical scrolling so content is never cut.
