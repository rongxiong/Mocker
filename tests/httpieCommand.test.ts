import { describe, expect, it } from 'vitest';
import { buildHttpie } from '../web/src/lib/utils';

describe('buildHttpie', () => {
  it('builds a plain request', () => {
    expect(buildHttpie({ method: 'GET', url: 'http://localhost:3001/mock/api/ping' })).toBe(
      "http -v --ignore-stdin GET 'http://localhost:3001/mock/api/ping'",
    );
  });

  it('adds headers as request items', () => {
    const command = buildHttpie({
      method: 'POST',
      url: 'http://localhost:3001/mock/api/ping',
      headers: { 'X-Trace-Id': 'abc', '': 'ignored' },
    });
    expect(command).toBe(
      "http -v --ignore-stdin POST 'http://localhost:3001/mock/api/ping' \\\n  'X-Trace-Id: abc'",
    );
  });

  it('passes the body through --raw', () => {
    const command = buildHttpie({
      method: 'POST',
      url: 'http://localhost:3001/mock/api/ping',
      body: '{"pong":true}',
    });
    expect(command).toContain('  --raw \'{"pong":true}\'');
  });

  it('escapes single quotes so the command stays shell-safe', () => {
    const command = buildHttpie({
      method: 'POST',
      url: "http://localhost:3001/mock/api?note=it's",
      body: `{"note":"it's"}`,
    });
    expect(command).toContain("'http://localhost:3001/mock/api?note=it'\\''s'");
    expect(command).toContain(`--raw '{"note":"it'\\''s"}'`);
  });
});
