import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DB_FILE } from '../config';

/**
 * `node:sqlite` is loaded through `createRequire` so bundlers and test runners that
 * ship an outdated list of Node builtins (Vite, for instance) still resolve it.
 */
const requireBuiltin = createRequire(import.meta.url);

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface StatementLike {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

let instance: DatabaseLike | null = null;
let driverName = 'unknown';

/** Values accepted by SQLite bindings. */
export type SqlValue = string | number | bigint | Buffer | null;

export function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (Buffer.isBuffer(value)) return value;
  return String(value);
}

async function createWithNodeSqlite(): Promise<DatabaseLike | null> {
  try {
    const mod = requireBuiltin('node:sqlite') as {
      DatabaseSync: new (location: string) => {
        exec(sql: string): void;
        prepare(sql: string): StatementLike;
        close(): void;
      };
    };
    if (!mod?.DatabaseSync) return null;
    const raw = new mod.DatabaseSync(DB_FILE);
    return {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => raw.prepare(sql) as unknown as StatementLike,
      close: () => raw.close(),
    };
  } catch {
    return null;
  }
}

async function createWithBetterSqlite(): Promise<DatabaseLike | null> {
  const specifier = 'better-sqlite3';
  try {
    const mod = (await import(specifier)) as {
      default: new (location: string) => {
        exec(sql: string): void;
        prepare(sql: string): StatementLike;
        close(): void;
      };
    };
    const Ctor = mod.default ?? (mod as never);
    if (!Ctor) return null;
    const raw = new Ctor(DB_FILE);
    return {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => raw.prepare(sql),
      close: () => raw.close(),
    };
  } catch {
    return null;
  }
}

export async function initDb(): Promise<DatabaseLike> {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const builtin = await createWithNodeSqlite();
  if (builtin) {
    driverName = 'node:sqlite';
    instance = builtin;
  } else {
    instance = await createWithBetterSqlite();
    driverName = 'better-sqlite3';
  }
  if (!instance) {
    throw new Error(
      'No SQLite driver available. Node >= 22.5 provides the built-in `node:sqlite` module; ' +
        'alternatively install `better-sqlite3`.',
    );
  }
  instance.exec('PRAGMA journal_mode = WAL;');
  return instance;
}

export function db(): DatabaseLike {
  if (!instance) {
    throw new Error('Database has not been initialized. Call `initDb()` during startup.');
  }
  return instance;
}

export function driver(): string {
  return driverName;
}

export function run(sql: string, ...params: unknown[]): RunResult {
  return db()
    .prepare(sql)
    .run(...params.map(toSqlValue));
}

export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return db()
    .prepare(sql)
    .get(...params.map(toSqlValue)) as T | undefined;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db()
    .prepare(sql)
    .all(...params.map(toSqlValue)) as T[];
}

let transactionDepth = 0;

/**
 * Runs `fn` inside a single SQLite transaction so multi-step writes (import,
 * bulk replace) are all-or-nothing. Nested calls join the outer transaction.
 */
export function transaction<T>(fn: () => T): T {
  const database = db();
  if (transactionDepth > 0) return fn();
  database.exec('BEGIN');
  transactionDepth += 1;
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* the connection may already be gone; the original error matters more */
    }
    throw error;
  } finally {
    transactionDepth -= 1;
  }
}
