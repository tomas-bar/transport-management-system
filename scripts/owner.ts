import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.ts';
import { hashPassword } from '../server/security.ts';
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Usage: npm run account:owner -- owner@example.com < password-file');
if (process.stdin.isTTY) throw new Error('Read the password from a protected file via stdin; do not pass it as a command argument.');
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
const hash = await hashPassword(password);
const store = new Store(process.env.KRYPTA_DB_PATH ?? resolve('data/server.sqlite'));
try {
  if (store.db.prepare("SELECT id FROM accounts WHERE role='owner'").get()) throw new Error('An owner already exists. Use account settings to change the password.');
  store.db.prepare("INSERT INTO accounts VALUES(?,NULL,NULL,?,?,'owner',?,1)").run(randomUUID(), email, 'Platformos savininkas', hash);
  store.audit(null, null, 'owner.created');
  console.log('Owner account created. Sign in with the supplied email and password.');
} finally { store.close(); }
