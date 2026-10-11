import { beforeEach, describe, expect, it } from 'vitest';
import { makeSession, SESSION_MS, verifySession } from '@/lib/server/auth';
import { POST as login } from '@/app/api/login/route';
import { resetRateLimits } from '@/lib/server/ratelimit';
import { PASSWORD } from './helpers';

beforeEach(() => { process.env.APP_PASSWORD = PASSWORD; resetRateLimits() });

function form(pw: string, ip = '10.1.1.1') {
  const body = new URLSearchParams({ password: pw });
  return new Request('https://desk.example/api/login', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip } });
}

describe('sessions', () => {
  it('accepts its own token and rejects tampering, other secrets and expiry', async () => {
    const t = await makeSession(PASSWORD);
    expect(await verifySession(PASSWORD, t)).toBe(true);
    expect(await verifySession('other', t)).toBe(false);
    expect(await verifySession(PASSWORD, t.slice(0, -1) + (t.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(await verifySession(PASSWORD, t, Date.now() + SESSION_MS + 1000)).toBe(false);
    expect(await verifySession(undefined, t)).toBe(false);
    expect(await verifySession(PASSWORD, undefined)).toBe(false);
  });
});

describe('POST /api/login', () => {
  it('sets an HttpOnly secure cookie for the right password', async () => {
    const r = await login(form(PASSWORD));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/');
    const c = r.headers.get('set-cookie') || '';
    expect(c).toMatch(/^ad_session=/);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
  });
  it('rejects a wrong password without a cookie', async () => {
    const r = await login(form('wrong'));
    expect(r.headers.get('location')).toBe('/login?e=bad');
    expect(r.headers.get('set-cookie')).toBeNull();
  });
  it('limits guesses per IP', async () => {
    for (let i = 0; i < 10; i++) await login(form('wrong', '10.2.2.2'));
    const r = await login(form(PASSWORD, '10.2.2.2'));
    expect(r.headers.get('location')).toBe('/login?e=wait');
  });
});
