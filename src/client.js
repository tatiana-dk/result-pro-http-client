import { HttpError } from "./utils.js";

export { HttpError };

export function createClient(config = {}) {
  const {
    baseURL = '',
    headers: defaultHeaders = {},
    timeout,
    beforeRequest,
    afterResponse
  } = config;

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

  async function request(options) {
    // 1. Копируем опции, чтобы не менять оригинал
    let currentOptions = { ...options };

    // 2. Хук ДО запроса
    if (beforeRequest) {
      currentOptions = await beforeRequest(currentOptions) || currentOptions;
      // можно вернуть новые опции или ничего (тогда берём как есть)
    }

    // 1. Собираем URL + query
    let fullUrl = options.url;
    if (options.query) {
      fullUrl = buildUrl(fullUrl, options.query);
    }
    if (!fullUrl.startsWith('http')) {
      fullUrl = baseURL + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
    }

    // 2. Объединяем заголовки
    const mergedHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
      ...currentOptions.headers,
    };

    // 3. Готовим тело
    let body = undefined;
    if (options.body !== undefined) {
      if (mergedHeaders['Content-Type'] === 'application/json') {
        body = JSON.stringify(options.body);
      } else {
        body = options.body; // FormData, строка, Blob и т.д.
      }
    }

    // 4. Таймаут
    const signal = options.signal;

    const internalController = new AbortController();
    const effectiveSignal = signal || internalController.signal;

    let timeoutId;

    const ms = options.timeout ?? timeout ?? 0; // 0 = без таймаута
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

      // 4. Хук ПОСЛЕ ответа (успешный или с ошибкой)
      if (afterResponse) {
        const modified = await afterResponse(response, currentOptions);
        if (modified) {
          response = modified; // можно вернуть другой Response или даже данные
        }
      }

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText, response);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (err) {
      if (afterResponse) {
        await afterResponse(null, currentOptions, err).catch(() => {}); // не ломать цепочку
      }

      if (err instanceof HttpError) {
        throw err;  
      }
      
      if (err.name === 'AbortError') {
        const abortedError = new HttpError(0, 'Aborted', null, 'Request aborted');
        abortedError.isAbort = true;
        abortedError.isTimeout = !signal && !!timeoutId; // таймаут только если наш внутренний
        throw abortedError;
      }

      // другие сетевые ошибки
      const netError = new HttpError(0, 'Network Error', null, err.message);
      netError.isNetwork = true;
      throw netError;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
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