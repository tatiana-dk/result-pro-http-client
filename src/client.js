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

    // Кэш: Map<url, { data, timestamp }>
    const cache = new Map();

    async function request(options) {
        let currentOptions = {...options};

        if (beforeRequest)
            currentOptions = (await beforeRequest(currentOptions)) || currentOptions;

        const {maxAttempts, baseDelayMs, maxDelayMs, backoffFactor} = getRetryOptions(currentOptions.retry);

        if (maxAttempts <= 1) {
            return performRequestOnce(currentOptions);
        }

        let attempt = 1;
        let lastError;

        while (true) {
            try {
                const data = await performRequestOnce(currentOptions);
                return data;
            } catch (err) {
                lastError = err;

                const normalized = normalizeError(err, currentOptions.signal, /* timeoutId не нужен здесь */);

                if (!shouldRetry(normalized, maxAttempts, attempt)) {
                    throw normalized;
                }

                const delay = calculateRetryDelay(attempt, baseDelayMs, backoffFactor, maxDelayMs);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
            }
        }
    }

    async function performRequestOnce(options) {
        const fullUrl = buildFullUrl(options.url, options.query, baseURL);

        const isGet = isGetRequest(options);
        const canUseCache = isGet && cacheTTL > 0;

        if (canUseCache) {
            const cachedData = tryGetFromCache(fullUrl, cacheTTL, cache);
            if (cachedData !== null) {
                return cachedData;
            }
        }

        const mergedHeaders = mergeHeaders(defaultHeaders, options.headers);
        const body = prepareBody(mergedHeaders, options.body);

        // Таймаут + сигнал
        const internalController = new AbortController();
        const effectiveSignal = getEffectiveSignal(options.signal, internalController);

        let timeoutId;
        const ms = options.timeout ?? timeout ?? 0;
        if (ms > 0 && !options.signal) {
            timeoutId = setTimeout(() => internalController.abort(), ms);
        }

        try {
            const response = await fetch(fullUrl, {
                method: options.method || 'GET',
                headers: mergedHeaders,
                body,
                signal: effectiveSignal,
            });

            // Хук afterResponse
            let processedResponse = response;
            if (afterResponse) {
                const modified = await afterResponse(response, options);
                if (modified) processedResponse = modified;
            }

            if (!processedResponse.ok) {
                throw new HttpError(processedResponse.status, processedResponse.statusText, processedResponse);
            }

            const data = await parseResponse(processedResponse);

            // Кэширование (если GET и включено)
            if (canUseCache) {
                saveToCache(fullUrl, data, cache);
            }

            return data;
        } catch (err) {
            if (afterResponse) {
                await afterResponse(null, options, err).catch(() => {});
            }
            throw err; // будет нормализовано в request
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