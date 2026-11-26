// The rentals app: a small HTTP server over one Postgres database.
//   GET  /                       listings page
//   GET  /login, POST /login     sign in
//   GET  /apply, POST /apply     application form
//   GET  /applications/:id       one application, as a page
//   GET  /api/listings?street=   listings as JSON, filtered by street
//   GET  /api/applications/:id   one application as JSON
//   POST /api/applications       create an application from JSON
//   GET  /health
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { hash, openDatabase } from './db.mjs';
import { applicationPage, applyPage, listingsPage, loginPage } from './pages.mjs';

const send = (res, status, body, headers = {}) => {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8', ...headers });
  res.end(json ? JSON.stringify(body) : body);
};

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if ((req.headers['content-type'] ?? '').includes('application/json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function createApp(dataDir) {
  const db = await openDatabase(dataDir);

  async function currentUser(req) {
    const token = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    if (!token) return null;
    const found = await db.query('select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id where s.token = $1', [token]);
    return found.rows[0] ?? null;
  }

  async function createApplication(user, input) {
    const created = await db.query(
      'insert into applications (listing_id, user_id, phone, message) values ($1, $2, $3, $4) returning id',
      [Number(input.listing), user.id, input.phone, input.message],
    );
    console.log(`application ${created.rows[0].id} from ${user.email} phone ${input.phone}`);
    return created.rows[0].id;
  }

  const routes = {
    'GET /health': async (req, res) => send(res, 200, { status: 'ok' }),

    'GET /': async (req, res) => {
      const listings = (await db.query('select id, title, street, rent from listings order by id')).rows;
      for (const listing of listings) {
        const units = (await db.query('select available from units where listing_id = $1', [listing.id])).rows;
        listing.units = units.length;
        listing.free = units.filter((u) => u.available).length;
      }
      send(res, 200, listingsPage(listings, await currentUser(req)));
    },

    'GET /login': async (req, res) => send(res, 200, loginPage()),

    'POST /login': async (req, res) => {
      const { email, password } = await readBody(req);
      const found = await db.query('select id from users where email = $1 and password_hash = $2', [email, hash(password ?? '')]);
      if (!found.rows.length) return send(res, 401, loginPage('Email or password is wrong.'));
      const token = randomBytes(24).toString('hex');
      await db.query('insert into sessions (token, user_id) values ($1, $2)', [token, found.rows[0].id]);
      send(res, 302, '', { location: '/', 'set-cookie': `session=${token}; Path=/` });
    },

    'GET /apply': async (req, res, url) => {
      if (!(await currentUser(req))) return send(res, 302, '', { location: '/login' });
      const listing = await db.query('select id, title from listings where id = $1', [Number(url.searchParams.get('listing'))]);
      if (!listing.rows.length) return send(res, 404, 'No such listing.');
      send(res, 200, applyPage(listing.rows[0]));
    },

    'POST /apply': async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 302, '', { location: '/login' });
      const id = await createApplication(user, await readBody(req));
      send(res, 302, '', { location: `/applications/${id}` });
    },

    'GET /api/listings': async (req, res, url) => {
      const street = url.searchParams.get('street') ?? '';
      const found = await db.query(`select id, title, street, rent from listings where street ilike '%${street}%' order by id`);
      send(res, 200, found.rows);
    },

    'POST /api/applications': async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'Sign in first.' });
      send(res, 201, { id: await createApplication(user, await readBody(req)) });
    },
  };

  async function application(req, res, id, asPage) {
    if (!(await currentUser(req))) return send(res, 401, asPage ? 'Sign in first.' : { error: 'Sign in first.' });
    const found = await db.query(
      'select a.id, a.user_id, a.phone, a.message, a.created_at, l.title from applications a join listings l on l.id = a.listing_id where a.id = $1',
      [id],
    );
    if (!found.rows.length) return send(res, 404, asPage ? 'No such application.' : { error: 'Not found.' });
    send(res, 200, asPage ? applicationPage(found.rows[0]) : found.rows[0]);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const one = /^(\/api)?\/applications\/(\d+)$/.exec(url.pathname);
      if (req.method === 'GET' && one) return await application(req, res, Number(one[2]), !one[1]);
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, 'Not found.');
      await route(req, res, url);
    } catch (error) {
      send(res, 500, { error: error.message, stack: error.stack });
    }
  });
  return { server, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const { server } = await createApp(process.env.DATA_DIR ?? '.data');
  server.listen(port, () => console.log(`Rentals is running at http://localhost:${port}`));
}
