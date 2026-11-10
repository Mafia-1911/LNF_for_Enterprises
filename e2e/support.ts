// Helpers for end-to-end tests: sign-in shortcuts, codes from Mailpit and the dev SMS page,
// axe checks and direct database checks.
import { existsSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
for (const file of ['.env', '.env.example']) {
  const p = path.join(root, file);
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

export const APP = 'http://localhost:5173';
const MAILPIT = `http://localhost:${process.env['LF_MAILPIT_PORT'] ?? '8025'}`;

/** Dev-only "sign in as" (the endpoint behind /dev/tools). */
export async function signInAs(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post(`${APP}/api/auth/dev/sign-in-as`, {
    data: { email },
    headers: { origin: APP },
  });
  expect(res.status()).toBe(200);
}

/** Puts the server clock back to real time (/dev/tools may have moved it). */
export async function resetServerClock(request: APIRequestContext): Promise<void> {
  await request.post(`${APP}/api/dev/clock`, { data: { reset: true }, headers: { origin: APP } });
}

/** The latest 6-digit code emailed to `to` (Mailpit catches all local mail). */
export async function emailedCode(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const res = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`,
    );
    const body = (await res.json()) as { messages?: { Subject: string }[] };
    const code = /^(\d{6})/.exec(body.messages?.[0]?.Subject ?? '')?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No code emailed to ${to}`);
}

export async function clearMailpit(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT}/api/v1/messages`);
}

/** The latest code the dev SMS adapter "sent" to `to`. */
export async function textedCode(request: APIRequestContext, to: string): Promise<string> {
  const res = await request.get(`${APP}/api/dev/sms`);
  const body = (await res.json()) as { messages: { to: string; body: string }[] };
  const code = /(\d{6})/.exec(body.messages.find((m) => m.to === to)?.body ?? '')?.[1];
  if (!code) throw new Error(`No code texted to ${to}`);
  return code;
}

/** WCAG 2.1 A/AA scan: zero serious or critical violations. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    blocking.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
    ),
    `axe on ${label}`,
  ).toEqual([]);
}

/** Owner connection to the dev database, for checking what the app wrote. */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env['DATABASE_OWNER_URL'] });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** The server's "now" (it can be moved from /dev/tools, so tests ask the server). */
export async function serverNow(request: APIRequestContext): Promise<Date> {
  const res = await request.get(`${APP}/api/dev/clock`);
  return new Date(((await res.json()) as { now: string }).now);
}

/** A datetime-local value `hoursAgo` hours before `now`, as typed in Asia/Dhaka (UTC+6). */
export function dhakaInput(now: Date, hoursAgo: number): string {
  return new Date(now.getTime() - hoursAgo * 3_600_000 + 6 * 3_600_000).toISOString().slice(0, 16);
}
