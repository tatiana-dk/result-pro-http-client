import {
    HttpError,
    normalizeError,
    mergeHeaders,
    prepareBody,
    getEffectiveSignal,
    calculateRetryDelay,
    shouldRetry,
    getRetryOptions,
    buildFullUrl,
    isGetRequest,
    parseResponse
} from "./utils/base.js";

import { tryGetFromCache, saveToCache } from './utils/cache.js';

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

    const cache = new Map();

    async function performUploadWithProgress(options) {
        return new Promise((resolve, reject) => {
            const fullUrl = buildFullUrl(options.url, options.query, baseURL);
            const mergedHeaders = mergeHeaders(defaultHeaders, options.headers);
            const body = prepareBody(mergedHeaders, options.body);

            const xhr = new XMLHttpRequest();
            xhr.open(options.method, fullUrl, true);

            // Устанавливаем заголовки
            Object.entries(mergedHeaders).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    xhr.setRequestHeader(key, value);
                }
            });

            // Прогресс загрузки
            if (options.onUploadProgress && typeof options.onUploadProgress === 'function') {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        options.onUploadProgress({
                            loaded: e.loaded,
                            total: e.total,
                            percent: Math.round((e.loaded / e.total) * 100)
                        });
                    }
                };
            }

            // Таймаут
            if (options.timeout ?? timeout) {
                xhr.timeout = options.timeout ?? timeout;
                xhr.ontimeout = () => {
                    reject(Object.assign(new Error('Request timeout'), { isTimeout: true }));
                };
            }

            // Отмена через AbortSignal
            let aborted = false;
            if (options.signal) {
                options.signal.addEventListener('abort', () => {
                    aborted = true;
                    xhr.abort();
                    reject(new Error('Request aborted'));
                });
            }

            xhr.onload = () => {
                if (aborted) return;

                if (xhr.status >= 200 && xhr.status < 300) {
                    let data;
                    const contentType = xhr.getResponseHeader('content-type') || '';

                    try {
                        if (contentType.includes('application/json')) {
                            data = JSON.parse(xhr.responseText);
                        } else {
                            data = xhr.responseText;
                        }
                        resolve(data);
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                } else {
                    const err = new HttpError(xhr.status, xhr.statusText, null);
                    err.responseText = xhr.responseText;
                    reject(err);
                }
            };

            xhr.onerror = () => reject(new Error('Network error'));
            xhr.onabort = () => {
                if (!aborted) reject(new Error('Request aborted'));
            };

            xhr.send(body || null);
        });
    }

    async function performRequestOnce(options) {
        const fullUrl = buildFullUrl(options.url, options.query, baseURL);

        // Проверка кэша (кэш не используем, если есть прогресс — чтобы показывать реальный процесс)
        const isGet = isGetRequest(options);
        const canUseCache = isGet && cacheTTL > 0 && !options.onDownloadProgress;

        if (canUseCache) {
            const cachedData = tryGetFromCache(fullUrl, cacheTTL, cache);
            if (cachedData !== null) {
                // для кэша можно сразу эмулировать прогресс 100%
                options.onDownloadProgress?.({
                    loaded: 1,
                    total: 1,
                    percent: 100,
                    fromCache: true
                });
                return cachedData;
            }
        }

        const mergedHeaders = mergeHeaders(defaultHeaders, options.headers);
        const body = prepareBody(mergedHeaders, options.body);

        // Если есть onUploadProgress и метод с телом → используем XHR
        const method = (options.method || 'GET').toUpperCase();
        const hasBody = body !== undefined;
        const needsUploadProgress = options.onUploadProgress && ['POST', 'PUT', 'PATCH'].includes(method);

        if (needsUploadProgress && hasBody) {
            // ... (твой существующий код performUploadWithProgress)
            const data = await performUploadWithProgress({
                ...options,
                method,
                url: fullUrl,
                headers: mergedHeaders,
                body,
            });
            return data;
        }

        // ────────────────────────────────────────────────
        // Обычный fetch + download progress
        // ────────────────────────────────────────────────
        const internalController = new AbortController();
        const effectiveSignal = getEffectiveSignal(options.signal, internalController);

        let timeoutId;
        const ms = options.timeout ?? timeout ?? 0;
        if (ms > 0 && !options.signal) {
            timeoutId = setTimeout(() => internalController.abort(), ms);
        }

        try {
            const response = await fetch(fullUrl, {
                method,
                headers: mergedHeaders,
                body,
                signal: effectiveSignal,
            });

            let processedResponse = response;
            if (afterResponse) {
                const modified = await afterResponse(response, options);
                if (modified) processedResponse = modified;
            }

            if (!processedResponse.ok) {
                throw new HttpError(processedResponse.status, processedResponse.statusText, processedResponse);
            }

            // ─── Download Progress ────────────────────────────────────────
            const onDownloadProgress = options.onDownloadProgress;
            const hasProgress = onDownloadProgress && typeof onDownloadProgress === 'function';

            let total = Number(processedResponse.headers.get('content-length')) || 0;
            let loaded = 0;

            const reader = processedResponse.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (value) {
                    chunks.push(value);
                    loaded += value.length;

                    if (hasProgress) {
                        onDownloadProgress({
                            loaded,
                            total: total || loaded,         // если total неизвестен — используем loaded
                            percent: total ? Math.round((loaded / total) * 100) : 0,
                            estimatedTotal: total > 0,
                            fromCache: false
                        });
                    }
                }
            }

            // Собираем ответ из чанков
            const blob = new Blob(chunks);
            let data;

            const contentType = processedResponse.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = JSON.parse(await blob.text());
            } else {
                data = await blob.text(); // или .arrayBuffer(), .blob() и т.д.
            }

            // ─── Кэширование ──────────────────────────────────────────────
            if (canUseCache) {
                saveToCache(fullUrl, data, cache);
            }

            // Финальный прогресс 100% (на случай, если total был неточным)
            if (hasProgress && total > 0) {
                onDownloadProgress({
                    loaded: total,
                    total,
                    percent: 100,
                    estimatedTotal: true,
                    fromCache: false
                });
            }

            return data;
        } catch (err) {
            if (afterResponse) {
                await afterResponse(null, options, err).catch(() => {});
            }
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async function request(options) {
        let currentOptions = { ...options };

        if (beforeRequest) {
            currentOptions = (await beforeRequest(currentOptions)) || currentOptions;
        }

        const { maxAttempts, baseDelayMs, maxDelayMs, backoffFactor } = getRetryOptions(currentOptions.retry);

        if (maxAttempts <= 1) {
            return performRequestOnce(currentOptions);
        }

        let attempt = 1;
        let lastError;

        while (true) {
            try {
                return await performRequestOnce(currentOptions);
            } catch (err) {
                lastError = err;
                const normalized = normalizeError(err, currentOptions.signal);

                if (!shouldRetry(normalized, maxAttempts, attempt)) {
                    throw normalized;
                }

                const delay = calculateRetryDelay(attempt, baseDelayMs, backoffFactor, maxDelayMs);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
            }
        }
    }

    return {
        request,
        get:    (url, opts = {}) => request({ method: 'GET',    url, ...opts }),
        post:   (url, body, opts = {}) => request({ method: 'POST',   url, body, ...opts }),
        put:    (url, body, opts = {}) => request({ method: 'PUT',    url, body, ...opts }),
        patch:  (url, body, opts = {}) => request({ method: 'PATCH',  url, body, ...opts }),
        del:    (url, opts = {}) => request({ method: 'DELETE', url, ...opts }),
    };
}