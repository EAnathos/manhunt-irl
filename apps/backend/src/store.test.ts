import { describe, it, expect } from 'vitest';
import { generateCode, generateSessionId, games } from './store.js';

describe('generateCode', () => {
  it('returns a 6-char uppercase alphanumeric string', () => {
    const code = generateCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
  });

  it('returns unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode());
    }
    expect(codes.size).toBe(100);
  });
});

describe('generateSessionId', () => {
  it('returns a 48-char hex string', () => {
    const sid = generateSessionId();
    expect(sid).toHaveLength(48);
    expect(sid).toMatch(/^[0-9a-f]+$/);
  });
});
