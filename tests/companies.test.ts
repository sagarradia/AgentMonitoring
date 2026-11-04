import { describe, expect, it } from 'vitest';
import { newCompany, slug } from '@/lib/companies';
import { cleanHire } from '@/lib/reqs';

describe('new company', () => {
  it('makes an id from the name and keeps a clean site and rate', () => {
    const r = newCompany({ name: ' Acme  Foods ', site: 'https://acme.example', purpose: 'Snacks', rate: '1500' }, []);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.id).toBe('co_acme-foods');
    expect(r.rec.name).toBe('Acme Foods');
    expect(r.rec.site).toContain('acme.example');
    expect(r.rate).toBe(1500);
  });
  it('refuses empty, bad address and duplicates in plain words', () => {
    expect(newCompany({ name: '' }, [])).toBe('Give the company a name');
    expect(newCompany({ name: 'Acme', site: 'javascript:alert(1)' }, [])).toMatch(/https/);
    expect(newCompany({ name: 'Acme' }, ['co_acme'])).toMatch(/already exists/);
    expect(newCompany({ name: 'trvo' }, ['sagarradia__trvo'])).toMatch(/already exists/);
    expect(newCompany({ name: '!!!' }, [])).toMatch(/letters/);
  });
  it('slug is safe', () => { expect(slug('A/B  c!')).toBe('a-b-c') });
});

describe('hire read from chat', () => {
  it('accepts a known department and a reason', () => {
    expect(cleanHire({ dept: 'Marketing', designation: 'junior', note: 'Launch content is behind' })).toEqual({ dept: 'Marketing', designation: 'junior', note: 'Launch content is behind' });
  });
  it('drops unknown departments and thin reasons, defaults the designation', () => {
    expect(cleanHire({ dept: 'Astrology', note: 'Need a stargazer please' })).toBeNull();
    expect(cleanHire({ dept: 'Sales', note: 'short' })).toBeNull();
    expect(cleanHire({ dept: 'Sales', designation: 'boss', note: 'Pipeline needs a closer' })?.designation).toBe('agent');
  });
});
