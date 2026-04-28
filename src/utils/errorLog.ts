// Lightweight client-side error log persisted to localStorage.
// Captures uncaught errors and unhandled promise rejections so the user can
// review them inside the app (no Sentry / external service).

const KEY = 'dealflow-error-log';
const MAX_ENTRIES = 100;

export interface LoggedError {
  id: string;
  at: string;
  message: string;
  stack?: string;
  source: 'boundary' | 'window' | 'promise' | 'manual';
  url: string;
}

export function loadErrorLog(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearErrorLog() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('errorlog:change'));
}

export function logError(err: unknown, source: LoggedError['source'] = 'manual') {
  const entry: LoggedError = {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    at: new Date().toISOString(),
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    source,
    url: window.location.href,
  };
  const prev = loadErrorLog();
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('errorlog:change'));
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', e => logError(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', e => logError(e.reason, 'promise'));
}
