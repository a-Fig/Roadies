import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const BASE = 'http://localhost:8080';
const SHOTS = 'test-results/screens';

/** Every browser context a test opens; closed afterwards so old phones don't rejoin later tests. */
const contexts: BrowserContext[] = [];
async function newContext(browser: Browser, options: Parameters<Browser['newContext']>[0]) {
  // English unless a test says otherwise: the UI follows the browser's language.
  // Reduced motion so the girlfriend's intro (played on every open of Your jam)
  // resolves immediately instead of running its several-second GSAP timeline.
  const context = await browser.newContext({ locale: 'en-US', reducedMotion: 'reduce', ...options });
  contexts.push(context);
  return context;
}

/** A demo phone. Demo mode joins muted; unless `live: false`, it then taps Unmute like a judge would. */
async function phone(browser: Browser, spot: string, { live = true } = {}): Promise<Page> {
  const context = await newContext(browser, { ...devices['Pixel 7'], permissions: ['microphone'] });
  const page = await context.newPage();
  await page.goto(`${BASE}/demo?spot=${spot}`);
  // Your jam: "connect" is today's closest-room join (unchanged behavior).
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.voice-status')).toHaveText(/Voice Connected/);
  await expect(page.locator('.banner')).toHaveText('MUTED · say “unmute”');
  if (live) {
    await page.getByRole('button', { name: 'Unmute' }).click();
    await expect(page.locator('.banner')).toHaveCount(0);
  }
  return page;
}

const myId = (page: Page) => page.evaluate(() => window.__roadies!.getView().myId!);
const voice = (page: Page) => page.evaluate(() => window.__roadies!.voice.debug());
const subscribed = async (page: Page) => (await voice(page)).subscribedAudio;

async function say(request: APIRequestContext, carId: string, text: string) {
  const res = await request.post(`${BASE}/dev/say`, { data: { carId, text } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { cmd: string | null };
}

async function serverState(request: APIRequestContext) {
  const res = await request.get(`${BASE}/dev/state`);
  return (await res.json()) as {
    listener: { rooms: string[]; subscriptions: Record<string, string[]> } | null;
    heardSamples: Record<string, number> | null;
    heardLangs: Record<string, string> | null;
  };
}

const listenerHears = async (request: APIRequestContext, id: string) => {
  const s = await serverState(request);
  return Object.values(s.listener?.subscriptions ?? {}).some((ids) => ids.includes(id));
};

test.beforeEach(async ({ request }) => {
  await request.post(`${BASE}/dev/reset`);
});

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('two phones in the same jam share a room and hear each other', async ({ browser, request }) => {
  const a = await phone(browser, 'sfo');
  const b = await phone(browser, 'sfo');
  await expect(a.locator('.status-title')).toHaveText('SFO #1');
  await expect(b.locator('.status-sub')).toHaveText('2 roadies in this room');
  await expect.poll(() => subscribed(a)).toBe(1);
  await expect.poll(() => subscribed(b)).toBe(1);

  // The hidden listener receives both mics.
  const idA = await myId(a);
  const idB = await myId(b);
  await expect.poll(() => listenerHears(request, idA)).toBe(true);
  await expect.poll(() => listenerHears(request, idB)).toBe(true);
  await expect.poll(async () => (await serverState(request)).heardSamples?.[idA] ?? 0).toBeGreaterThan(16_000);

  await a.screenshot({ path: `${SHOTS}/phone-live.png` });
});

test('demo phones join muted: the listener hears you, the room does not, until you say "unmute"', async ({ browser, request }) => {
  const a = await phone(browser, 'sfo', { live: false });
  const b = await phone(browser, 'sfo');
  const idA = await myId(a);
  // A can hear the room while muted...
  await expect.poll(() => subscribed(a)).toBe(1);
  // ...the listener hears A, so "unmute" works...
  await expect.poll(() => listenerHears(request, idA)).toBe(true);
  // ...but B never gets A's audio.
  await b.waitForTimeout(1000);
  expect(await subscribed(b)).toBe(0);
  await a.screenshot({ path: `${SHOTS}/phone-joined-muted.png` });

  expect((await say(request, idA, 'unmute')).cmd).toBe('unmute');
  await expect(a.locator('.banner')).toHaveCount(0);
  await expect.poll(() => subscribed(b)).toBe(1);
});

test('saying "mute" hides your mic from the room but not from the listener', async ({ browser, request }) => {
  const a = await phone(browser, 'sfo');
  const b = await phone(browser, 'sfo');
  const idA = await myId(a);
  await expect.poll(() => subscribed(b)).toBe(1);

  expect((await say(request, idA, 'Mute.')).cmd).toBe('mute');
  await expect(a.locator('.banner')).toHaveText('MUTED · say “unmute”');
  await expect(a.getByTestId('hint')).toHaveText('✓ Heard “mute”');
  await a.screenshot({ path: `${SHOTS}/phone-muted.png` });
  // B loses A's audio (permission revoked)...
  await expect.poll(() => subscribed(b)).toBe(0);
  // ...but the listener keeps receiving it, so "unmute" can still be heard.
  expect(await listenerHears(request, idA)).toBe(true);
  const before = (await serverState(request)).heardSamples?.[idA] ?? 0;
  await expect.poll(async () => (await serverState(request)).heardSamples?.[idA] ?? 0).toBeGreaterThan(before + 8_000);

  await say(request, idA, 'unmute');
  await expect(a.locator('.banner')).toHaveCount(0);
  await expect.poll(() => subscribed(b)).toBe(1);
});

test('conversation is not a command', async ({ browser, request }) => {
  const a = await phone(browser, 'palo-alto');
  const idA = await myId(a);
  expect((await say(request, idA, "don't mute me")).cmd).toBeNull();
  await expect(a.locator('.banner')).toHaveCount(0);
});

test('deafen stops you hearing the room; undeafen restores it', async ({ browser, request }) => {
  const a = await phone(browser, 'sfo');
  const b = await phone(browser, 'sfo');
  const idA = await myId(a);
  await expect.poll(() => subscribed(a)).toBe(1);

  await say(request, idA, 'deafen');
  await expect(a.locator('.banner')).toHaveText('DEAFENED · say “undeafen”');
  await expect.poll(() => subscribed(a)).toBe(0);
  await expect.poll(() => subscribed(b)).toBe(0); // deafened also means not transmitting

  await say(request, idA, 'undeafen');
  await expect.poll(() => subscribed(a)).toBe(1);
  await expect.poll(() => subscribed(b)).toBe(1);
});

test('disconnect and connect by voice', async ({ browser, request }) => {
  const a = await phone(browser, 'sfo');
  const b = await phone(browser, 'sfo');
  const idA = await myId(a);

  await say(request, idA, 'disconnect');
  await expect(a.locator('.status-title')).toHaveText('Disconnected');
  await expect(a.getByTestId('hint')).toContainText('connect');
  // Room count, glanceable alone as with company - no "Just you so far" sentence.
  await expect(b.locator('.status-sub')).toHaveText('1 roadies in this room');
  await expect.poll(() => subscribed(b)).toBe(0);
  // Still listening for "connect".
  expect(await listenerHears(request, idA)).toBe(true);
  await a.screenshot({ path: `${SHOTS}/phone-disconnected.png` });

  await say(request, idA, 'connect');
  await expect(a.locator('.status-title')).toHaveText('SFO #1');
  await expect(b.locator('.status-sub')).toHaveText('2 roadies in this room');
  await expect.poll(() => subscribed(b)).toBe(1);
});

test('a French phone: French screen, and saying "coupe le micro" mutes it', async ({ browser, request }) => {
  const context = await newContext(browser, { ...devices['Pixel 7'], permissions: ['microphone'] });
  await context.addInitScript(() => localStorage.setItem('roadies.lang', 'fr'));
  const page = await context.newPage();
  await page.goto(`${BASE}/demo?spot=sfo`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('button', { name: 'Connexion' })).toContainText('connexion');
  await page.getByRole('button', { name: 'Connexion' }).click();
  await expect(page.locator('.voice-status')).toHaveText(/Vocal connecté/);
  await expect(page.locator('.banner')).toHaveText('MICRO COUPÉ · dis « active le micro »');

  // The listener hears this phone in French.
  const id = await myId(page);
  await expect.poll(async () => (await serverState(request)).heardLangs?.[id]).toBe('fr');

  await page.getByRole('button', { name: 'Activer le micro' }).click();
  await expect(page.locator('.banner')).toHaveCount(0);
  expect((await say(request, id, 'Coupe le micro.')).cmd).toBe('mute');
  await expect(page.locator('.banner')).toHaveText('MICRO COUPÉ · dis « active le micro »');
  await expect(page.getByTestId('hint')).toHaveText('✓ Compris : « coupe le micro »');
  await page.screenshot({ path: `${SHOTS}/phone-fr-muted.png` });
  // English still works.
  expect((await say(request, id, 'unmute')).cmd).toBe('unmute');
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('buttons do the same as voice commands', async ({ browser }) => {
  const a = await phone(browser, 'redwood-city');
  await a.getByRole('button', { name: 'Mute' }).click();
  await expect(a.locator('.banner')).toHaveText('MUTED · say “unmute”');
  await a.getByRole('button', { name: 'Unmute' }).click();
  await expect(a.locator('.banner')).toHaveCount(0);
  await a.getByRole('button', { name: 'Disconnect' }).click();
  await expect(a.locator('.status-title')).toHaveText('Disconnected');
  await a.getByRole('button', { name: 'Connect' }).click();
  await expect(a.locator('.status-title')).toHaveText('Redwood City #1');
});

test('tapping the "random" card jumps to a different open room', async ({ browser }) => {
  // Fill SFO to capacity so the next phones open a genuinely separate room —
  // any-distance joining would otherwise fold everyone into one room.
  const a1 = await phone(browser, 'sfo');
  await phone(browser, 'sfo');
  await phone(browser, 'sfo');
  await phone(browser, 'sfo');
  const b1 = await phone(browser, 'palo-alto');
  await phone(browser, 'palo-alto');

  await a1.getByRole('button', { name: 'Disconnect' }).click();
  await expect(a1.locator('.status-title')).toHaveText('Disconnected');
  // SFO still has two other active members, so "random" must skip it and offer Palo Alto.
  await expect(a1.getByRole('button', { name: 'Random' })).toBeEnabled();

  await a1.getByRole('button', { name: 'Random' }).click();
  await expect(a1.locator('.status-title')).toHaveText('Palo Alto #1');
  await expect(b1.locator('.status-sub')).toHaveText('3 roadies in this room');
});

test('a lone commuter is merged into the nearest open room after 15 seconds', async ({ browser }) => {
  test.setTimeout(90_000);
  // Rooms hold 4 and joining is "closest room with space, any distance", so San Jose
  // must be full before the loner below can be forced into a room of their own.
  const a = await phone(browser, 'san-jose');
  await phone(browser, 'san-jose');
  await phone(browser, 'san-jose');
  const d = await phone(browser, 'san-jose');
  const loner = await phone(browser, 'loner');
  await expect(loner.locator('.status-sub')).toHaveText('1 roadies in this room');
  // Free a seat in San Jose — but not down to exactly one active member, so it doesn't
  // start its own alone-timer — giving the loner somewhere to be merged into.
  await d.getByRole('button', { name: 'Disconnect' }).click();
  await expect(loner.locator('.status-title')).toHaveText('San Jose 101/880 #1', { timeout: 30_000 });
  await expect(loner.locator('.status-sub')).toHaveText('4 roadies in this room');
  await expect(a.locator('.status-sub')).toHaveText('4 roadies in this room');
  await expect.poll(() => subscribed(loner), { timeout: 20_000 }).toBe(3);
});

test('the projector shows rooms, members and cars', async ({ browser, request }) => {
  const a = await phone(browser, 'hospital-curve');
  await phone(browser, 'hospital-curve');
  // Joining is "closest active room with a free seat, any distance": with Hospital
  // Curve #1 sitting at 2/4, this San Mateo phone lands in that same room rather
  // than opening its own, so there's still only one room until it fills up.
  await phone(browser, 'san-mateo');
  await say(request, await myId(a), 'mute');

  const context = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const presenter = await context.newPage();
  await presenter.goto(`${BASE}/presenter?key=demo&admin`);
  await expect(presenter.locator('.channel-name')).toHaveCount(1);
  await expect(presenter.locator('.channel-name').first()).toContainText('Hospital Curve #1');
  await expect(presenter.locator('.channel-name').first()).toContainText('3/4');
  await expect(presenter.locator('.member')).toHaveCount(3);
  await expect(presenter.locator('.car-dot')).toHaveCount(3);
  await expect(presenter.locator('.qr-card img')).toBeVisible();

  // Presenter spawns a lone commuter on cue.
  await presenter.getByRole('button', { name: /Spawn lone commuter/ }).click();
  await expect(presenter.locator('.car-dot')).toHaveCount(4);
  await expect(presenter.locator('.merge')).toHaveCount(1);
  await presenter.waitForTimeout(1500);
  await presenter.screenshot({ path: `${SHOTS}/presenter.png` });

  // Wrong key is rejected.
  const other = await context.newPage();
  await other.goto(`${BASE}/presenter?key=nope`);
  await expect(other.getByText(/Wrong presenter key/)).toBeVisible();
});

test('normal mode: a random car is assigned on first open, no forced /setup; customize, then drive with real GPS', async ({ browser }) => {
  const context = await newContext(browser, {
    ...devices['Pixel 7'],
    permissions: ['microphone', 'geolocation'],
    // On 101 at Hospital Curve.
    geolocation: { latitude: 37.7515, longitude: -122.4034 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  // Your jam right away - never forced to /setup - with an auto-assigned car.
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.locator('.car-chip')).toBeVisible();

  // Setup stays reachable any time from its gear icon.
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Purple').click();
  await page.getByRole('button', { name: 'Miata', exact: true }).click();
  await page.getByLabel('Display name').fill('Fig');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByText('You’re the Fig')).toBeVisible();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.voice-status')).toHaveText(/Voice Connected/);
  await expect(page.locator('.status-title')).toHaveText('Hospital Curve #1');
  await expect(page.locator('.me')).toHaveText('Fig');
});
