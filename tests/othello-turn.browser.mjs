// Run with node tests/othello-turn.browser.mjs. PLAYWRIGHT_MODULE can point to an existing installation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const mocks = {
  "next-intl": "const t = key => key; export const useTranslations = () => t;",
};
for (const name of ["CharacterAvatar", "SpeechBubble", "ResultPanel", "GuestbookCommentSection"]) {
  mocks[`@/components/${name}`] = "export default () => null;";
}
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"development"}' },
  stdin: {resolveDir: root, loader: "tsx", contents: `
    import {StrictMode} from 'react';
    import {createRoot} from 'react-dom/client';
    import GamePage from './src/components/GamePage';
    import {useGameStore} from './src/store/useGameStore';
    localStorage.removeItem('hhwx-othello-game');
    Math.random = () => 0;
    if (location.pathname === '/pass') {
      const board = Array.from({length: 8}, () => Array(8).fill('black'));
      board[0][0] = null; board[0][1] = 'white';
      localStorage.setItem('hhwx-othello-game', JSON.stringify({board, currentPlayer: 'white',
        gamePhase: 'playing', isLocked: false, lastMove: null, passMessage: null,
        playerColor: 'black', aiColor: 'white'}));
    }
    useGameStore.getState().setCharactersById('kokoro', 'hagumi');
    createRoot(document.getElementById('root')).render(<StrictMode>
      <button onClick={() => useGameStore.getState().toggleDebugMode()}>Toggle debug</button>
      <GamePage />
    </StrictMode>);
  `},
  plugins: [{name: "local-fixtures", setup(builder) {
    builder.onResolve({filter: /.*/}, ({path}) => Object.hasOwn(mocks, path) ? {path, namespace: "fixture"} : undefined);
    builder.onLoad({filter: /.*/, namespace: "fixture"}, ({path}) => ({contents: mocks[path], resolveDir: root}));
  }}],
});
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/app.js" ? "text/javascript" : "text/html");
  response.end(request.url === "/app.js" ? bundle.outputFiles[0].text
    : '<!doctype html><title>Othello turn regression</title><style>.othello-board{display:grid;grid-template-columns:repeat(8,30px)}.othello-cell{height:30px}</style><div id="root"></div><script type="module" src="/app.js"></script>');
});
await new Promise(done => server.listen(0, "localhost", done));
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  const base = `http://localhost:${server.address().port}`;
  const savedGame = () => page.evaluate(() => JSON.parse(localStorage.getItem("hhwx-othello-game")));

  await page.goto(`${base}/pass`);
  await page.getByText("aiPass", {exact: true}).waitFor();
  await page.waitForTimeout(500);
  await page.getByRole("button", {name: "Toggle debug"}).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("hhwx-othello-game")).currentPlayer === "black");
  await page.waitForTimeout(800);
  assert.equal((await savedGame()).currentPlayer, "black", "Changing debug during AI pass must not schedule a second turn switch");
  assert.equal(await page.locator(".othello-cell.valid-hint").count(), 1, "The player retains the legal move");

  for (const debugAtStart of [false, true]) {
    await page.goto(`${base}/normal`);
    await page.locator(".othello-cell.valid-hint").first().waitFor();
    if (debugAtStart) await page.getByRole("button", {name: "Toggle debug"}).click();
    await page.locator(".othello-cell.valid-hint").first().click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("hhwx-othello-game")).currentPlayer === "white");
    assert.equal(await page.locator(".othello-cell.has-weight").count() > 0, debugAtStart, "Weights use the preference at turn start");
    await page.getByRole("button", {name: "Toggle debug"}).click();
    assert.equal(await page.locator(".othello-cell.has-weight").count(), 0);
    if (debugAtStart) {
      await page.getByRole("button", {name: "Toggle debug"}).click();
      assert.ok(await page.locator(".othello-cell.has-weight").count() > 0, "Existing weights can be shown again without restarting the turn");
    }
    await page.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem("hhwx-othello-game"));
      return saved.currentPlayer === "black" && saved.board.flat().filter(Boolean).length === 6;
    });
    await page.locator(".othello-cell.valid-hint").first().waitFor();
    assert.equal((await savedGame()).board.flat().filter(Boolean).length, 6, "One player move and exactly one AI move complete");
  }
  assert.deepEqual(errors, []);
  console.log("PASS: AI pass survives debug toggle; normal turns run once and snapshot the latest debug preference; Strict Mode has no runtime errors");
} finally {
  await browser.close();
  server.close();
}
