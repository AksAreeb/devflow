// Database set-up: a Postgres instance that runs inside this process.
// Pass a folder to keep the data between runs, or nothing for an in-memory one.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const hash = (password) => createHash('sha256').update(password).digest('hex');

const STREETS = ['King Street West', 'Princess Street', 'Brock Street', 'Division Street', 'Johnson Street'];

export async function openDatabase(dataDir) {
  const db = new PGlite(dataDir);
  const ready = await db.query("select 1 from information_schema.tables where table_name = 'users'");
  if (ready.rows.length) return db;

  await db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  await db.query('insert into users (email, name, password_hash) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)', [
    'owner@example.com', 'Olive Owner', hash('owner-pass'),
    'tenant@example.com', 'Tariq Tenant', hash('tenant-pass'),
    'other@example.com', 'Uma Other', hash('other-pass'),
  ]);
  for (let i = 0; i < 12; i += 1) {
    const listing = await db.query(
      'insert into listings (owner_id, title, street, rent) values (1, $1, $2, $3) returning id',
      [`${i + 2} bedroom near campus`, `${100 + i * 7} ${STREETS[i % STREETS.length]}`, 1450.5 + i * 125],
    );
    for (let u = 0; u < 3; u += 1) {
      await db.query('insert into units (listing_id, label, bedrooms, available) values ($1, $2, $3, $4)', [
        listing.rows[0].id, `Unit ${u + 1}`, (i % 3) + 1, (i + u) % 2 === 0,
      ]);
    }
  }
  await db.query("insert into applications (listing_id, user_id, phone, message) values (1, 3, '613-555-0142', 'Moving in May.')");
  return db;
}
