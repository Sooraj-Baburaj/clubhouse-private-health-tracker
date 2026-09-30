type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let min: Level = (process.env.LOG_LEVEL as Level) || 'info';

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (order[level] < order[min]) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  // eslint-disable-next-line no-console -- structured stdout logging is the log sink on Vercel
  else console.log(line);
}

export const log = {
  setLevel: (l: Level) => (min = l),
  debug: (m: string, f?: Record<string, unknown>) => emit('debug', m, f),
  info: (m: string, f?: Record<string, unknown>) => emit('info', m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit('warn', m, f),
  error: (m: string, f?: Record<string, unknown>) => emit('error', m, f),
};
