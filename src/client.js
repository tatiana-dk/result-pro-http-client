import { HttpError } from "./utils.js";

export { HttpError };

export function createClient(config = {}) {
  const {
    baseURL = '',
    headers: defaultHeaders = {},
    timeout,
    cacheTTL = 0,
    beforeRequest,
    afterResponse
  } = config;

  // Кэш: Map<url, { data, timestamp }>
  const cache = new Map();

  // Вспомогательная функция: добавляет query-параметры к URL
  function buildUrl(url, query = {}) {
    if (!query || Object.keys(query).length === 0) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    }
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

    // Вспомогательная функция для нормализации ошибок
    function normalizeError(err, signal, timeoutId) {
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
    }

    async function request(options) {
        // Копируем опции, чтобы не менять оригинал
        let currentOptions = {
            ...options
        };

        // Хук ДО запроса
        if (beforeRequest) {
            currentOptions = (await beforeRequest(currentOptions)) || currentOptions;
        }

        // Настройки повторов (по умолчанию — без повторов)
        const retry = currentOptions.retry ?? {};
        const maxAttempts = retry.maxAttempts ?? 1; // 1 = без повторов
        const baseDelayMs = retry.baseDelayMs ?? 1000;
        const maxDelayMs = retry.maxDelayMs ?? 10000;
        const backoffFactor = retry.backoffFactor ?? 2;

        // Определяем, стоит ли вообще включать механизм повторов
        const shouldEnableRetry = maxAttempts > 1;

        let attempt = 1;
        let lastError;

        while (true) {
            // 1. Собираем URL + query
            let fullUrl = currentOptions.url;
            if (currentOptions.query) {
                fullUrl = buildUrl(fullUrl, currentOptions.query);
            }
            if (!fullUrl.startsWith('http')) {
                fullUrl = baseURL + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
            }

            const isGetRequest = (currentOptions.method || 'GET') === 'GET';
            const canUseCache = isGetRequest && cacheTTL > 0;

            if (canUseCache) {
                const cached = cache.get(fullUrl);
                if (cached) {
                    const age = Date.now() - cached.timestamp;
                    if (age < cacheTTL) {
                        console.debug(`[cache hit] ${fullUrl} (age: ${age}ms)`);
                        return cached.data;
                    } else {
                        console.debug(`[cache expired] ${fullUrl}`);
                        cache.delete(fullUrl);
                    }
                }
            }

            // 2. Объединяем заголовки
            const mergedHeaders = {
                'Content-Type': 'application/json',
                ...defaultHeaders,
                ...currentOptions.headers,
            };

            // 3. Готовим тело
            let body = undefined;
            if (currentOptions.body !== undefined) {
                if (mergedHeaders['Content-Type'] === 'application/json') {
                    body = JSON.stringify(currentOptions.body);
                } else {
                    body = currentOptions.body;
                }
            }

            // 4. Таймаут и сигнал отмены
            const signal = currentOptions.signal;
            const internalController = new AbortController();
            const effectiveSignal = signal || internalController.signal;

            let timeoutId;
            const ms = currentOptions.timeout ?? timeout ?? 0;
            if (ms > 0 && !signal) {
                timeoutId = setTimeout(() => internalController.abort(), ms);
            }

            let response;

            try {
                response = await fetch(fullUrl, {
                    method: currentOptions.method || 'GET',
                    headers: mergedHeaders,
                    body,
                    signal: effectiveSignal,
                });

                // Хук ПОСЛЕ ответа
                if (afterResponse) {
                    const modified = await afterResponse(response, currentOptions);
                    if (modified) response = modified;
                }

                if (!response.ok) {
                    throw new HttpError(response.status, response.statusText, response);
                }

                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    data = await response.text();
                }

                if (canUseCache) {
                    cache.set(fullUrl, {
                        data,
                        timestamp: Date.now(),
                    });
                    console.debug(`[cache saved] ${fullUrl}`);
                }

                return data;
            } catch (err) {
                lastError = err;

                if (afterResponse) {
                    await afterResponse(null, currentOptions, err).catch(() => {});
                }

                // Нормализуем ошибку
                const normalizedError = normalizeError(err, signal, timeoutId);

                // Определяем, можно ли повторить запрос
                const isRetryable =
                    normalizedError.isTimeout ||
                    normalizedError.isNetwork ||
                    (normalizedError.status >= 500 && normalizedError.status < 600) ||
                    normalizedError.status === 429;

                const isLastAttempt = attempt >= maxAttempts;

                if (!shouldEnableRetry || !isRetryable || isLastAttempt) {
                    throw normalizedError;
                }

                // Задержка перед следующей попыткой
                const delay = Math.min(
                    baseDelayMs * Math.pow(backoffFactor, attempt - 1),
                    maxDelayMs
                );

                await new Promise(resolve => setTimeout(resolve, delay));

                attempt++;
                // продолжаем цикл → новая попытка
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }
    }

  return {
    request,

    // Короткие методы — основные действия
    get(url, options = {}) {
      return request({ method: 'GET', url, ...options });
    },

    post(url, body, options = {}) {
      return request({ method: 'POST', url, body, ...options });
    },

    put(url, body, options = {}) {
      return request({ method: 'PUT', url, body, ...options });
    },

    patch(url, body, options = {}) {
      return request({ method: 'PATCH', url, body, ...options });
    },

    del(url, options = {}) {  // delete — зарезервированное слово
      return request({ method: 'DELETE', url, ...options });
    },
  };
}