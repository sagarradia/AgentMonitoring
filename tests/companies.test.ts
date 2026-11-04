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
    expect(cleanHire({ dept: 'Marketing', seniority: 'junior', note: 'Launch content is behind' })).toEqual({ dept: 'Marketing', seniority: 'junior', jobTitle: '', note: 'Launch content is behind' });
  });
  it('drops unknown departments and thin reasons, defaults the seniority', () => {
    expect(cleanHire({ dept: 'Astrology', note: 'Need a stargazer please' })).toBeNull();
    expect(cleanHire({ dept: 'Sales', note: 'short' })).toBeNull();
    expect(cleanHire({ dept: 'Sales', designation: 'boss', note: 'Pipeline needs a closer' })?.seniority).toBe('agent');
  });
});

import { setRepoIn } from '@/lib/companies';
import { companyOf, repoMapOf, setRepoMap } from '@/lib/org';
describe('grouping repos under a company', () => {
  it('puts a repo in one company at a time and moves its limits and rate', () => {
    const companies: Record<string, any> = { co_a: { custom: true, name: 'A', repos: [] }, co_b: { custom: true, name: 'B', repos: ['o__x'] } };
    const limits = [{ company: 'o__x' }, { company: 'o__other' }]; const rates: Record<string, number> = { o__x: 100 };
    const note = setRepoIn(companies, limits, rates, 'co_a', 'o__x', true);
    expect(companies.co_a.repos).toEqual(['o__x']); expect(companies.co_b.repos).toEqual([]);
    expect(limits[0].company).toBe('co_a'); expect(limits[1].company).toBe('o__other');
    expect(rates).toEqual({ co_a: 100 }); expect(note).toMatch(/1 hiring limit moved/);
    setRepoIn(companies, limits, rates, 'co_a', 'o__x', false);
    expect(companies.co_a.repos).toEqual([]);
    expect(setRepoIn(companies, limits, rates, 'o__zzz', 'o__x', true)).toMatch(/Only a company/);
  });
  it('maps agents of a grouped repo to the company, and others to themselves', () => {
    setRepoMap(repoMapOf({ co_a: { repos: ['o__x', 'o__y'] } }));
    expect(companyOf('o__x')).toBe('co_a'); expect(companyOf('o__y')).toBe('co_a'); expect(companyOf('o__z')).toBe('o__z');
    setRepoMap({});
  });
});
