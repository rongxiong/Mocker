import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';
import util from 'node:util';
import crypto from 'node:crypto';
import querystring from 'node:querystring';
import { faker } from '@faker-js/faker';
import RandExp from 'randexp';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { SCRIPT_TIMEOUT_MS } from '../config';

/** `randexp` is replaced later by `SandboxRandExp` to survive cross-realm regexps. */
const MODULES: Record<string, unknown> = {
  faker,
  '@faker-js/faker': { faker },
  randexp: null,
  uuid: { v4: uuidv4, validate: uuidValidate },
  path,
  url,
  util,
  crypto,
  querystring,
};

export const IMPORTABLE_MODULES = Object.keys(MODULES);

function safeRequire(name: string): unknown {
  if (typeof name !== 'string') {
    throw new Error('require() expects a module name string');
  }
  // Accepts both `path` and `node:path`.
  const normalized = name.replace(/^node:/, '');
  const mod = MODULES[normalized] ?? MODULES[`node:${normalized}`];
  if (!mod) {
    throw new Error(
      `Module "${name}" is not allowed in the sandbox. Available: ${IMPORTABLE_MODULES.join(', ')}`,
    );
  }
  return mod;
}

const RandExpCtor = RandExp as unknown as { new (re: RegExp | string, m?: string): object };

/**
 * RegExp literals created inside a `vm` context belong to the sandbox realm, so host
 * libraries (`randexp`) reject them via `instanceof`. Rebuild them on the host side.
 */
function toHostRegExp(input: unknown): RegExp {
  if (typeof input === 'string') return new RegExp(input);
  if (input instanceof RegExp) return input;
  const candidate = input as { source?: unknown; flags?: unknown } | null;
  if (candidate && typeof candidate.source === 'string') {
    return new RegExp(candidate.source, typeof candidate.flags === 'string' ? candidate.flags : '');
  }
  throw new Error('Expected a regexp or string');
}

const SandboxRandExp = new Proxy(RandExpCtor, {
  construct(target, args: unknown[]) {
    return new target(toHostRegExp(args[0]), args[1] as string | undefined);
  },
});

MODULES.randexp = SandboxRandExp;

export interface ScriptContext {
  req: unknown;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Executes user-authored mock scripts inside a `vm` context.
 *
 * NOTE: `vm` is a convenience boundary for typos and runaway loops, NOT a security
 * sandbox. Only run scripts you trust — this is a local development tool.
 *
 * `vm`'s `timeout` only bounds the synchronous run, so host timers are not handed
 * out raw: `setInterval`/`clearInterval` are not available at all and every
 * `setTimeout` scheduled by a script is cancelled as soon as the script returns.
 */
export function runScript(code: string, req: unknown): unknown {
  const pendingTimers = new Set<TimerHandle>();

  const sandboxSetTimeout = (
    handler: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ): TimerHandle => {
    const handle = setTimeout(handler, ms, ...args);
    pendingTimers.add(handle);
    return handle;
  };

  const sandboxClearTimeout = (handle: TimerHandle | undefined): void => {
    if (handle === undefined) return;
    pendingTimers.delete(handle);
    clearTimeout(handle);
  };

  const sandboxConsole = {
    log: (...args: unknown[]) => console.log('[mock:script]', ...args),
    warn: (...args: unknown[]) => console.warn('[mock:script]', ...args),
    error: (...args: unknown[]) => console.error('[mock:script]', ...args),
  };

  const sandbox: Record<string, unknown> = {
    req,
    console: sandboxConsole,
    faker,
    RandExp: SandboxRandExp,
    uuid: uuidv4,
    require: safeRequire,
    setTimeout: sandboxSetTimeout,
    clearTimeout: sandboxClearTimeout,
    // Explicitly hidden rather than merely omitted: a repeating timer outlives the
    // response and `vm`'s `timeout` cannot bound it.
    setInterval: undefined,
    clearInterval: undefined,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    // Host intrinsics keep `instanceof` checks working across the vm realm
    // (e.g. `new RandExp(/abc/)` requires a host RegExp instance).
    RegExp,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    Map,
    Set,
    Promise,
  };

  const context = vm.createContext(sandbox);
  try {
    // The script is invoked *inside* the context: `timeout` only applies to the code
    // executed by `runInContext`, so a separately called factory could loop forever.
    return vm.runInContext(`(function () {\n${code}\n})()`, context, {
      timeout: SCRIPT_TIMEOUT_MS,
      filename: 'mock-script.js',
    }) as unknown;
  } finally {
    // Anything the script scheduled outlives the response; drop it so a stray
    // `setTimeout(() => { while (1) {} }, 0)` cannot wedge the process.
    for (const handle of pendingTimers) clearTimeout(handle);
    pendingTimers.clear();
  }
}
