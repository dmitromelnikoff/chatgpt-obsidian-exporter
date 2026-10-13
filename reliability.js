/* Explicitly bounded, polite download retries: one file at a time, no parallel fetches. */
(() => {
  'use strict';
  const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
  const MAX_WAIT_MS = 120000;
  const MAX_ATTEMPTS = 3;
  const DEFAULT_DELAYS = [3000, 6000];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function retryAfterMs(response, now = Date.now()) {
    const raw = response?.headers?.get?.('retry-after');
    if (!raw) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const time = Date.parse(raw);
    return Number.isNaN(time) ? null : Math.max(0, time - now);
  }
  function httpError(response, context = '') {
    const error = new Error(`HTTP ${response.status}${context ? ` (${context})` : ''}`);
    error.httpStatus = response.status;
    error.retryAfterMs = retryAfterMs(response);
    return error;
  }
  function isTransient(error) {
    if (error?.transient === true) return true;
    if (typeof error?.httpStatus === 'number') return TRANSIENT_STATUSES.has(error.httpStatus);
    // Network interruptions/timeouts can be temporary. Never retry explicit nontransient errors.
    return error?.name === 'TimeoutError' || error?.name === 'NetworkError' || error?.networkError === true;
  }
  function aggregateResolutionError(errors, failures) {
    const message = errors.length ? errors.join('; ').slice(0, 700) : 'неизвестная ошибка';
    const combined = new Error(`Не получена ссылка на файл: ${message}`);
    const transient = failures.find(isTransient);
    if (transient) {
      combined.transient = true;
      if (typeof transient.httpStatus === 'number') combined.httpStatus = transient.httpStatus;
      const retryAfterValues = failures.map(f => f?.retryAfterMs).filter(v => Number.isFinite(v));
      combined.retryAfterMs = retryAfterValues.length ? Math.max(...retryAfterValues) : null;
    } else {
      const last = failures[failures.length - 1];
      if (typeof last?.httpStatus === 'number') combined.httpStatus = last.httpStatus;
    }
    return combined;
  }
  function errorDetail(error) {
    return {
      http_status: typeof error?.httpStatus === 'number' ? error.httpStatus : null,
      error: String(error?.message || error).slice(0, 800)
    };
  }
  async function withRetries(download, onWait = () => {}, pause = sleep) {
    const history = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const value = await download(attempt);
        history.push({attempt, outcome: 'success', http_status: 200});
        return {value, attempts: attempt, history};
      } catch (error) {
        const entry = {attempt, outcome: 'failed', ...errorDetail(error)};
        history.push(entry);
        const retryable = isTransient(error);
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          error.downloadHistory = history;
          error.downloadAttempts = attempt;
          throw error;
        }
        const retryAfter = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0;
        const delayMs = Math.max(DEFAULT_DELAYS[attempt - 1], retryAfter);
        if (delayMs > MAX_WAIT_MS) {
          entry.retry_blocked = `Сервер запросил ожидание ${Math.ceil(delayMs / 1000)} секунд; автоматический повтор не выполнен.`;
          error.downloadHistory = history;
          error.downloadAttempts = attempt;
          throw error;
        }
        entry.wait_before_retry_ms = delayMs;
        await onWait({attempt, nextAttempt: attempt + 1, maxAttempts: MAX_ATTEMPTS,
          delayMs, error: entry.error, httpStatus: entry.http_status});
        await pause(delayMs);
      }
    }
    throw Error('Внутренняя ошибка механизма повторных попыток.');
  }
  globalThis.ChatGPTObsidianReliability = {
    sleep, withRetries, isTransient, httpError, aggregateResolutionError,
    retryAfterMs, MAX_ATTEMPTS, MAX_WAIT_MS
  };
})();
