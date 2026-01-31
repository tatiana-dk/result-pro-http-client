import { HttpError } from "./utils.js";

export { HttpError };

export function createClient(config = {}) {
  const {
    baseURL = '',
    headers: defaultHeaders = {},
    timeout,
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
      ...options.headers,
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
    const controller = new AbortController();
    let timeoutId;

    const ms = options.timeout ?? timeout ?? 0; // 0 = без таймаута
    if (ms > 0) {
        timeoutId = setTimeout(() => controller.abort(), ms);
    }

    try {
      const res = await fetch(fullUrl, {
        method: options.method || 'GET',
        headers: mergedHeaders,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new HttpError(res.status, res.statusText, res);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    } catch (err) {
      if (err instanceof HttpError) {
        throw err;  
      }
      
      if (err.name === 'AbortError') {
        const isTimeout = !!timeoutId; // если был таймер → считаем таймаутом
        const error = new HttpError(0, 'Aborted', null, isTimeout ? 'Request timeout' : 'Request aborted');
        error.isAbort = true;
        error.isTimeout = isTimeout;
        throw error;
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