export class HttpError extends Error {
  constructor(status, statusText, response, message = '') {
    super(message || `HTTP ${status} ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.response = response;      // оригинальный Response объект
    this.isAbort = false;
    this.isTimeout = false;
    this.isNetwork = false;
  }
}

// Вспомогательная функция: добавляет query-параметры к URL
export function buildUrl(url, query = {}) {
  if (!query || Object.keys(query).length === 0) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
};

// Вспомогательная функция для нормализации ошибок
export function normalizeError(err, signal, timeoutId) {
  if (err instanceof HttpError) {
      return err;
  }

  if (err.name === 'AbortError') {
      const error = new HttpError(0, 'Aborted', null, 'Request aborted');
      error.isAbort = true;
      error.isTimeout = !signal && !!timeoutId;
      return error;
  }

  const error = new HttpError(0, 'Network Error', null, err.message || 'Network failure');
  error.isNetwork = true;
  return error;
};

export function mergeHeaders(defaults, requestHeaders) {
  return {
    'Content-Type': 'application/json',
    ...defaults,
    ...requestHeaders,
  };
}

export function prepareBody(headers, body) {
  if (body === undefined) return undefined;
  if (headers['Content-Type'] === 'application/json') {
    return JSON.stringify(body);
  }
  return body; // FormData, Blob, строка и т.д.
}

export function getEffectiveSignal(optionsSignal, internalController) {
  return optionsSignal || internalController.signal;
}

export function calculateRetryDelay(attempt, baseDelayMs, backoffFactor, maxDelayMs) {
  const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelayMs);
}

export function shouldRetry(normalizedError, maxAttempts, attempt) {
  const isRetryable =
    normalizedError.isTimeout ||
    normalizedError.isNetwork ||
    (normalizedError.status >= 500 && normalizedError.status < 600) ||
    normalizedError.status === 429;

  return isRetryable && attempt < maxAttempts;
}

export function getRetryOptions(retry) {
  retry = retry ?? {};
  const maxAttempts = retry.maxAttempts ?? 1; // 1 = без повторов
  const baseDelayMs = retry.baseDelayMs ?? 1000;
  const maxDelayMs = retry.maxDelayMs ?? 10000;
  const backoffFactor = retry.backoffFactor ?? 2;

  return {maxAttempts, baseDelayMs, maxDelayMs, backoffFactor};
}

export function buildFullUrl(url, query, baseURL) {
  let full = url;
  if (query) full = buildUrl(full, query);
  if (!full.startsWith('http')) {
    full = baseURL + (full.startsWith('/') ? '' : '/') + full;
  }
  return full;
}

export function isGetRequest(options) {
  return (options.method || 'GET') === 'GET';
}

export async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
}