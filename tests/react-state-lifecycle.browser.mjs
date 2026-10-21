// Run with node tests/react-state-lifecycle.browser.mjs. PLAYWRIGHT_MODULE can
// point to an existing installation. All account data and requests stay local.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const messages = Object.fromEntries(await Promise.all(["account", "auth", "common", "errors"].map(async (name) => (
  [name, JSON.parse(await readFile(resolve(root, `messages/en/${name}.json`), "utf8"))]
))));
const mocks = {
  "@/app/[locale]/account/useAccountProfile": `
    import {createContext, createElement, useContext, useState} from 'react';
    const Context = createContext(null);
    const initial = {username: 'First user', email: 'first@example.test', emailVerified: true,
      avatarCardId: 1, avatarCardServer: 0, avatarCardTrainType: 'normal',
      displayDegreeServer: 0, displayDegreeId: 100, displayDegreeEffectId: null};
    export function Fixture({children}) {
      const [profile, setProfile] = useState(initial);
      return createElement(Context.Provider, {value: {profile, setProfile, userId: 'fixture',
        authReady: true, loadingProfile: false, profileError: ''}},
        createElement('button', {onClick: () => setProfile({...initial, username: 'Second user',
          email: 'second@example.test', avatarCardId: 3})}, 'Refresh profile'), children);
    }
    export const useLocalizedAccountProfile = () => useContext(Context);
    export const getAccessToken = async () => 'fixture-token';`,
  "@/app/[locale]/account/AccountShell": `import {createElement} from 'react';
    export default ({children, title}) => createElement('main', null, createElement('h1', null, title), children);
    export const AccountErrorState = ({message}) => message;
    export const AccountLoadingState = ({message}) => message;
    export const AccountSignInState = () => 'Sign in';`,
  "@/hooks/useTurnstileAvailability": "export const useTurnstileAvailability = () => ({isTurnstileEnabled: false, isTurnstileLoading: false});",
  "@/components/TurnstileChallenge": "export default () => null;",
  "@/lib/supabase": "export const getSafeSession = async () => null; export const buildEmailVerificationCallbackUrl = () => '';",
  "@/hooks/useBandoriCardsMaster": "export const useBandoriCardsMaster = () => ({data: {}});",
  "@/hooks/useBandoriPublicAssetIndex": "export const useBandoriCardsAssetIndex = () => ({});",
  "@/hooks/useBandoriDegrees": "export const useBandoriDegreeCatalog = () => ({catalog: null, loading: false});",
  "@/components/bandori/BandoriServerIcon": "export default () => 'Server';",
  "@/components/bandori/BandoriDegreeView": "export default () => 'Degree';",
  "@/store/useBandoriPreferencesStore": "export const useBandoriPreferredServer = () => 0;",
  "@/components/account/AccountCardAvatar": "export default () => 'Avatar';",
  "@/components/bandori/card-picker/BandoriCardPicker": `import {createElement} from 'react';
    export default ({value, onValueChange}) => createElement('div', null,
      createElement('output', {'data-testid': 'draft-card'}, String(value?.cardId)),
      createElement('button', {onClick: () => onValueChange({cardId: 2, entityServer: 0, trainType: 'normal'})}, 'Choose card 2'));`,
};
mocks["../AccountShell"] = mocks["@/app/[locale]/account/AccountShell"];
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"development"}' },
  stdin: {resolveDir: root, loader: "tsx", contents: `
    import {StrictMode, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {Fixture, useLocalizedAccountProfile} from '@/app/[locale]/account/useAccountProfile';
    import ProfilePage from './src/app/[locale]/account/profile/page';
    import EmailPage from './src/app/[locale]/account/email/page';
    import Avatar from './src/app/[locale]/account/AccountAvatarCardControl';
    import Degree from './src/app/[locale]/account/AccountDisplayDegreeControl';
    import {useCommentReactionParticipants} from './src/hooks/useCommentReactionParticipants';
    const reactions = [{emojiKey: 'one', users: [], remainingUserCount: 3},
      {emojiKey: 'two', users: [], remainingUserCount: 1}];
    window.requests = [];
    const loadParticipants = (request) => new Promise(resolve => window.requests.push({...request, resolve}));
    function Participants({commentId}) {
      const state = useCommentReactionParticipants({commentId, initialEmojiKey: 'one', reactions, loadParticipants});
      return <div>
        <button onClick={() => state.selectEmoji('one')}>First reaction</button>
        <button onClick={() => state.selectEmoji('two')}>Second reaction</button>
        <button onClick={state.loadMore}>More participants</button>
        <output data-testid="participants">{state.selectedPage.users.map(user => user.userId).join(',')}</output>
        <output data-testid="loading">{String(state.selectedPage.isLoading)}</output>
      </div>;
    }
    function ReactionFixture() {
      const [commentId, setCommentId] = useState('first');
      return <><button onClick={() => setCommentId('second')}>Switch comment</button>
        <Participants key={commentId} commentId={commentId} /></>;
    }
    function AvatarFixture() {
      const {profile, setProfile} = useLocalizedAccountProfile();
      return <Avatar profile={profile} onProfileChange={setProfile} />;
    }
    function DegreeFixture() {
      const {profile, setProfile} = useLocalizedAccountProfile();
      return <Degree profile={profile} onProfileChange={setProfile} />;
    }
    const path = window.location.pathname;
    createRoot(document.getElementById('root')).render(<StrictMode>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={${JSON.stringify(messages)}}>
        <Fixture>{path === '/profile' ? <ProfilePage /> : path === '/email' ? <EmailPage />
          : path === '/avatar' ? <AvatarFixture /> : path === '/degree' ? <DegreeFixture /> : <ReactionFixture />}</Fixture>
      </NextIntlClientProvider></StrictMode>);
  `},
  plugins: [{name: "local-fixtures", setup(builder) {
    builder.onResolve({filter: /.*/}, ({path}) => {
      if (path === "../useAccountProfile" || path === "./useAccountProfile") path = "@/app/[locale]/account/useAccountProfile";
      return Object.hasOwn(mocks, path) ? {path, namespace: "fixture"} : undefined;
    });
    builder.onLoad({filter: /.*/, namespace: "fixture"}, ({path}) => ({contents: mocks[path], resolveDir: root}));
  }}],
});
const server = createServer((request, response) => {
  if (request.url === "/app.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(bundle.outputFiles[0].text);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html lang="en"><title>React lifecycle regression</title><div id="root"></div><script type="module" src="/app.js"></script></html>');
  }
});
await new Promise(done => server.listen(0, "localhost", done));
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  const base = `http://localhost:${server.address().port}`;
  for (const [path, type, first, second] of [
    ["profile", "text", "First user", "Second user"],
    ["email", "email", "first@example.test", "second@example.test"],
  ]) {
    await page.goto(`${base}/${path}`);
    const input = page.locator(`input[type="${type}"]`);
    await input.waitFor();
    assert.equal(await input.inputValue(), first);
    await input.fill("draft@example.test");
    await page.getByRole("button", {name: "Refresh profile", exact: true}).click();
    assert.equal(await input.inputValue(), second, "Changed profile replaces the old draft before painting");
    await input.fill("new-draft@example.test");
    await page.getByRole("button", {name: "Refresh profile", exact: true}).click();
    assert.equal(await input.inputValue(), "new-draft@example.test", "Equivalent profile refresh preserves editing");
  }
  await page.goto(`${base}/avatar`);
  const trigger = page.getByTestId("account-avatar-card-trigger");
  await trigger.click();
  assert.equal(await page.getByTestId("draft-card").textContent(), "1");
  await page.getByRole("button", {name: "Choose card 2"}).click();
  await page.keyboard.press("Escape");
  await trigger.click();
  assert.equal(await page.getByTestId("draft-card").textContent(), "1", "Cancel discards the draft");
  await page.keyboard.press("Escape");
  await page.getByRole("button", {name: "Refresh profile", exact: true}).click();
  await trigger.click();
  assert.equal(await page.getByTestId("draft-card").textContent(), "3", "Reopening uses the latest profile");

  const degreeRequests = [];
  await page.route("**/api/account/display-degree", route => { degreeRequests.push(route); });
  const degreeResponse = gameUid => ({status: 200, json: {success: true, data: {
    selected: {server: 0, degreeId: 100, degreeEffectId: null},
    accounts: [{server: 0, gameUid, ownedDegreeIds: [], ownedDegreeEffectIds: []}],
  }}});
  await page.goto(`${base}/degree`);
  const degreeTrigger = page.getByTitle(messages.account.displayDegree.chooseTitle);
  await Promise.all([page.waitForRequest("**/api/account/display-degree"), degreeTrigger.click()]);
  await page.keyboard.press("Escape");
  await Promise.all([page.waitForRequest("**/api/account/display-degree"), degreeTrigger.click()]);
  assert.equal(degreeRequests.length, 2, "Exactly one options request per open");
  await degreeRequests[1].fulfill(degreeResponse("2222"));
  await page.getByText("UID 2222", {exact: true}).waitFor();
  await degreeRequests[0].fulfill(degreeResponse("1111"));
  assert.equal(await page.getByText("UID 1111", {exact: true}).count(), 0, "Closed session cannot replace current options");
  assert.equal(await page.getByText("UID 2222", {exact: true}).count(), 1);

  await page.goto(`${base}/reactions`);
  await page.waitForFunction(() => window.requests.length === 2);
  assert.equal(await page.evaluate(() => window.requests[0].signal.aborted), true, "Strict Mode aborts the first read");
  await page.evaluate(() => window.requests[1].resolve({users: [{userId: "a"}], hasMore: true, nextCursor: "next"}));
  await page.getByTestId("participants").filter({hasText: "a"}).waitFor();
  await page.getByRole("button", {name: "More participants"}).click();
  await page.waitForFunction(() => window.requests.length === 3);
  assert.equal(await page.evaluate(() => window.requests[2].cursor), "next");
  await page.evaluate(() => window.requests[2].resolve({users: [{userId: "a"}, {userId: "b"}], hasMore: false, nextCursor: null}));
  await page.getByTestId("participants").filter({hasText: "a,b"}).waitFor();
  await page.getByRole("button", {name: "Second reaction"}).click();
  await page.waitForFunction(() => window.requests.length === 4);
  await page.getByRole("button", {name: "Switch comment"}).click();
  assert.equal(await page.evaluate(() => window.requests[3].signal.aborted), true);
  await page.evaluate(() => window.requests[3].resolve({users: [{userId: "stale"}], hasMore: false, nextCursor: null}));
  assert.equal(await page.getByTestId("participants").textContent(), "", "Old comment response cannot leak into the new one");
  assert.deepEqual(errors, []);
  console.log("PASS: profile/email drafts, avatar cancel/reopen, Degree request isolation, Strict Mode participant loads, deduplication and abort isolation");
} finally {
  await browser.close();
  server.close();
}
