type Level = 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  info: '\x1b[38;5;80m',
  warn: '\x1b[38;5;214m',
  error: '\x1b[38;5;203m',
};

const WEIGHT: Record<Level, number> = { error: 0, warn: 1, info: 2 };

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

/** `LOG_LEVEL=warn|error|silent` quietens the output; the default is `info`. */
function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (configured === 'silent' || configured === 'none') return -1;
  return WEIGHT[configured as Level] ?? WEIGHT.info;
}

function stamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function write(level: Level, args: unknown[]): void {
  if (WEIGHT[level] > threshold()) return;
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  console.log(`${DIM}${stamp()}${RESET} ${tag}`, ...args);
}

export const logger = {
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};
