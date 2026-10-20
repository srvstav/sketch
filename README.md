<p align="center"><b>Live: <a href="https://srvstav.github.io/sketch/">srvstav.github.io/sketch</a></b><br>Paste your course notes and get labelled pictures of the main ideas, then practise filling in the labels.</p>

# sketch

Turn lecture slides, a chapter or your notes into pictures you can't forget. Every picture is tested before you see it.

1. **Map.** Claude reads the material and finds the 3–8 core ideas. For each one it picks a shape that matches its
   structure: a process becomes a machine, a trade-off a seesaw, an argument a road with a fork. It also writes
   5 exam-style questions per idea.
2. **Draw.** One SVG per idea, plus an overview map of the whole topic. Key terms are marked for recall practice.
   Five shapes (machine, cycle, journey, dominoes, building) are drawn by sketch itself from the words the model
   picks, so labels never collide and a free model draws as well as a paid one. Each step gets an icon (from 55,
   e.g. scissors for a split, battery for ATP made) and its key number on a badge; numbers are recall labels too. Other shapes are drawn by the model.
3. **Check.** A second call sees *only the rendered picture* and answers the questions. A grader marks the answers
   against the material. Below 80%, sketch redraws with a list of what was missing (up to 3 rounds) and keeps the best.
4. **Recall.** Labels go blank and you fill them in. Close answers are checked for meaning. The ones you miss come
   back first next time.
5. **Explain.** Say or type the idea as if to a friend who missed the class. sketch lists which key facts you covered,
   which you left out, and anything you got wrong. Without a key it checks which key terms you used.

Runs entirely in the browser with your own key: **Gemini** (free tier works: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)), **Anthropic** or **OpenAI**. The key's format picks the provider. Your key and notes go only to that provider.

## Run it

```sh
npm install         # dev tools only: tests, e2e, CLI
npm run serve       # → http://localhost:8080
```

No build step. To host it, put the repo on any static host (GitHub Pages works). Try the bundled example deck
without a key: *Try an example: cellular respiration*.

## Measure it

```sh
npm test                                   # unit tests: loop, SVG cleaner, recall, export, request shape
node scripts/e2e.mjs out/                  # real browser, stubbed API, screenshots into out/
node scripts/preview-scenes.js             # every drawn shape (and worst cases) → runs/preview/*.png
GEMINI_API_KEY=… node scripts/sketch.js notes.pdf --focus "BIO 101 midterm"   # or ANTHROPIC_API_KEY
                                           # real run → runs/<date>-<topic>/ with SVGs, deck.html, scores.json
                                           # --freeform: the model draws every SVG, for before/after comparisons
```

`scores.json` holds the picture-only score per idea and per round. Run the same material before and after a prompt
change to see if it helped. The real test is people: `examples/cellular-respiration/quiz.md` has the 4-student
recall test.

## Layout

```
index.html, styles.css   the app shell
src/prompts.js           system prompt, shape library, drawing rules, JSON schemas  ← the part to tune
src/pipeline.js          map → draw → check → redraw, per idea in parallel (model injected; no DOM)
src/scenes.js            the five drawn shapes + overview: words in, laid-out SVG out
src/model.js             picks Claude or Gemini from the key
src/llm.js               Claude call: cached source, structured output, adaptive thinking, refusal fallback
src/gemini.js            Gemini call (REST generateContent): JSON schema, thinking level, waits out rate limits
src/svg.js               allowlist SVG cleaner + blank-out
src/recall.js            which labels to hide, local answer grading
src/app.js               UI (home / run / deck)
src/files.js store.js render.js export.js   browser I/O
scripts/sketch.js          CLI + eval harness     scripts/e2e.mjs   browser test
examples/                hand-drawn example deck + notes, summary and quiz for the recall test
```

## Gemini free tier

- Use a Flash model. Pro models had no free quota when tested (2026-10-20).
- Free calls are slow (10–60 s each) and rate-limited per minute; sketch waits and retries on its own.
- Daily limits reset at midnight Pacific time.

## Safety

- Pictures are cleaned with an allowlist (no scripts, foreign objects, external links or event handlers) and only
  ever shown through `<img>`, which never runs scripts. Imported decks are cleaned again.
- A strict Content-Security-Policy limits the page to its own files, esm.sh (the Claude SDK), Google Fonts, and the
  Anthropic and Gemini APIs.
- The judge call never sees your material, only the picture, so a picture can't pass by leaning on the text.
