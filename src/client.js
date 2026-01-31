// src/client.js

export function createClient(config = {}) {
  const {
    baseURL = '',
    headers: defaultHeaders = {},
    timeout,
  } = config;

  async function request(options) {
    // 1. Собираем полный URL
    let fullUrl = options.url;
    if (!fullUrl.startsWith('http')) {
      fullUrl = baseURL + (options.url.startsWith('/') ? '' : '/') + options.url;
    }

    // 2. Объединяем заголовки (частные имеют приоритет)
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
        body = options.body; // FormData, Blob, строка и т.д.
      }
    }

    // 4. Настраиваем таймаут (если указан)
    const controller = new AbortController();
    const signal = controller.signal;
    let timeoutId;

    const effectiveTimeout = options.timeout ?? timeout;
    if (effectiveTimeout) {
      timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    }

    try {
      // 5. Выполняем fetch
      const res = await fetch(fullUrl, {
        method: options.method || 'GET',
        headers: mergedHeaders,
        body,
        signal,
      });

      // 6. Проверяем статус
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      // 7. Парсим ответ в зависимости от типа
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      } else {
        return await res.text(); // или .blob(), .arrayBuffer() — можно позже расширить
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timeout or aborted');
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return {
    request,

    get: (url, opts = {}) =>
      request({ method: 'GET', url, ...opts }),

    post: (url, body, opts = {}) =>
      request({ method: 'POST', url, body, ...opts }),

    put: (url, body, opts = {}) =>
      request({ method: 'PUT', url, body, ...opts }),

    patch: (url, body, opts = {}) =>
      request({ method: 'PATCH', url, body, ...opts }),

    del: (url, opts = {}) =>  // delete — зарезервированное слово, поэтому del
      request({ method: 'DELETE', url, ...opts }),
  };
}