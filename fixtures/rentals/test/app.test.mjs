// Tests for the rentals app. Each test file gets its own in-memory database.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/server.mjs';

let app;
let base;

before(async () => {
  app = await createApp();
  await new Promise((resolve) => app.server.listen(0, resolve));
  base = `http://localhost:${app.server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => app.server.close(resolve));
  await app.db.close();
});

async function signIn(email, password) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });
  return { status: res.status, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}

test('health reports ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('the listings page shows every listing with its free units', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.equal(html.match(/<a href="\/apply\?listing=/g).length, 12);
  assert.match(html, /2 bedroom near campus/);
  assert.match(html, /2 of 3/);
});

test('searching listings by street works', async () => {
  const res = await fetch(`${base}/api/listings?street=king`);
  assert.equal(res.status, 200);
});

test('a wrong password is refused and a right one starts a session', async () => {
  assert.equal((await signIn('tenant@example.com', 'wrong')).status, 401);
  const session = await signIn('tenant@example.com', 'tenant-pass');
  assert.equal(session.status, 302);
  assert.match(session.cookie, /^session=[0-9a-f]{48}$/);
});

test('a signed-in tenant can apply, and a visitor cannot', async () => {
  const body = JSON.stringify({ listing: 2, phone: '613-555-0199', message: 'Two adults, no pets.' });
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/api/applications`, { method: 'POST', headers, body })).status, 401);

  const { cookie } = await signIn('tenant@example.com', 'tenant-pass');
  const created = await fetch(`${base}/api/applications`, { method: 'POST', headers: { ...headers, cookie }, body });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const read = await (await fetch(`${base}/api/applications/${id}`, { headers: { cookie } })).json();
  assert.equal(read.message, 'Two adults, no pets.');
});
