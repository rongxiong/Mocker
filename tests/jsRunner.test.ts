import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScript } from '../server/src/services/jsRunner';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runScript', () => {
  it('returns the value produced by the script', () => {
    expect(runScript('return 1 + 1;', {})).toBe(2);
    expect(runScript('return { code: 0, list: [1, 2] };', {})).toEqual({ code: 0, list: [1, 2] });
  });

  it('exposes the request snapshot as `req`', () => {
    const req = { method: 'POST', path: '/api/x', params: { id: '7' }, body: { a: 1 } };
    expect(runScript('return req.params.id;', req)).toBe('7');
    expect(runScript('return req.body.a;', req)).toBe(1);
  });

  it('provides faker, uuid and RandExp in the sandbox', () => {
    expect(typeof runScript('return faker.person.fullName();', {})).toBe('string');
    expect(runScript('return /^[0-9a-f-]{36}$/.test(uuid());', {})).toBe(true);
    const phone = runScript('return new RandExp(/^1[3-9]\\d{9}$/).gen();', {});
    expect(phone).toMatch(/^1[3-9]\d{9}$/);
  });

  it('supports the require() whitelist', () => {
    expect(typeof runScript("return require('faker').person.fullName();", {})).toBe('string');
    expect(runScript("return require('uuid').validate(require('uuid').v4());", {})).toBe(true);
    expect(typeof runScript("return require('node:path').join('a', 'b');", {})).toBe('string');
    expect(() => runScript("return require('fs');", {})).toThrow(/not allowed in the sandbox/);
    expect(() => runScript('return require(42);', {})).toThrow(/module name string/);
  });

  it('routes console output through the host, prefixed with [mock:script]', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    runScript('console.log("hello"); return 1;', {});
    expect(log).toHaveBeenCalledWith('[mock:script]', 'hello');
  });

  it('throws on syntax errors', () => {
    expect(() => runScript('return {;', {})).toThrow();
  });

  it('surfaces runtime errors thrown by the script', () => {
    expect(() => runScript('throw new Error("boom");', {})).toThrow('boom');
  });

  it('aborts scripts that exceed the timeout', () => {
    expect(() => runScript('while (true) {}', {})).toThrow(/timed out|Script execution/i);
  }, 15_000);

  it('does not hand out setInterval', () => {
    expect(runScript('return typeof setInterval;', {})).toBe('undefined');
    expect(() => runScript('setInterval(() => {}, 10);', {})).toThrow(/not a function/);
  });

  it('cancels timers scheduled by the script so they cannot outlive it', async () => {
    let fired = 0;
    runScript('setTimeout(() => { req.tick(); }, 5); return "ok";', {
      tick: () => {
        fired += 1;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toBe(0);
  });
});
