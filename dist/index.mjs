// src/utils/base.js
var HttpError = class extends Error {
  constructor(status, statusText, response, message = "") {
    super(message || `HTTP ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.response = response;
    this.isAbort = false;
    this.isTimeout = false;
    this.isNetwork = false;
  }
};
function buildUrl(url, query = {}) {
  if (!query || Object.keys(query).length === 0) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== void 0 && value !== null) {
      params.append(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}
function normalizeError(err, signal, timeoutId) {
  if (err instanceof HttpError) {
    return err;
  }
  if (err.name === "AbortError") {
    const error2 = new HttpError(0, "Aborted", null, "Request aborted");
    error2.isAbort = true;
    error2.isTimeout = !signal && !!timeoutId;
    return error2;
  }
  const error = new HttpError(0, "Network Error", null, err.message || "Network failure");
  error.isNetwork = true;
  return error;
}
function mergeHeaders(defaults, requestHeaders) {
  return {
    "Content-Type": "application/json",
    ...defaults,
    ...requestHeaders
  };
}
function prepareBody(headers, body) {
  if (body === void 0) return void 0;
  if (headers["Content-Type"] === "application/json") {
    return JSON.stringify(body);
  }
  return body;
}
function getEffectiveSignal(optionsSignal, internalController) {
  return optionsSignal || internalController.signal;
}
function calculateRetryDelay(attempt, baseDelayMs, backoffFactor, maxDelayMs) {
  const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelayMs);
}
function shouldRetry(normalizedError, maxAttempts, attempt) {
  const isRetryable = normalizedError.isTimeout || normalizedError.isNetwork || normalizedError.status >= 500 && normalizedError.status < 600 || normalizedError.status === 429;
  return isRetryable && attempt < maxAttempts;
}
function getRetryOptions(retry) {
  retry = retry ?? {};
  const maxAttempts = retry.maxAttempts ?? 1;
  const baseDelayMs = retry.baseDelayMs ?? 1e3;
  const maxDelayMs = retry.maxDelayMs ?? 1e4;
  const backoffFactor = retry.backoffFactor ?? 2;
  return { maxAttempts, baseDelayMs, maxDelayMs, backoffFactor };
}
function buildFullUrl(url, query, baseURL) {
  let full = url;
  if (query) full = buildUrl(full, query);
  if (!full.startsWith("http")) {
    full = baseURL + (full.startsWith("/") ? "" : "/") + full;
  }
  return full;
}
function isGetRequest(options) {
  return (options.method || "GET") === "GET";
}

// src/utils/cache.js
function tryGetFromCache(url, cacheTTL, cache) {
  if (cacheTTL <= 0) return null;
  const cached = cache.get(url);
  if (!cached) return null;
  const age = Date.now() - cached.timestamp;
  if (age < cacheTTL) {
    console.debug(`[cache hit] ${url} (age: ${Math.round(age / 1e3)} \u0441\u0435\u043A)`);
    return cached.data;
  }
  console.debug(`[cache expired] ${url} (age: ${Math.round(age / 1e3)} \u0441\u0435\u043A)`);
  cache.delete(url);
  return null;
}
function saveToCache(url, data, cache) {
  cache.set(url, {
    data,
    timestamp: Date.now()
  });
  console.debug(`[cache saved] ${url}`);
}

// src/client.js
function createClient(config = {}) {
  const {
    baseURL = "",
    headers: defaultHeaders = {},
    timeout,
    cacheTTL = 0,
    beforeRequest,
    afterResponse
  } = config;
  const cache = /* @__PURE__ */ new Map();
  async function performUploadWithProgress(options) {
    return new Promise((resolve, reject) => {
      const fullUrl = buildFullUrl(options.url, options.query, baseURL);
      const mergedHeaders = mergeHeaders(defaultHeaders, options.headers);
      const body = prepareBody(mergedHeaders, options.body);
      const xhr = new XMLHttpRequest();
      xhr.open(options.method, fullUrl, true);
      Object.entries(mergedHeaders).forEach(([key, value]) => {
        if (value !== void 0 && value !== null) {
          xhr.setRequestHeader(key, value);
        }
      });
      if (options.onUploadProgress && typeof options.onUploadProgress === "function") {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            options.onUploadProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round(e.loaded / e.total * 100)
            });
          }
        };
      }
      if (options.timeout ?? timeout) {
        xhr.timeout = options.timeout ?? timeout;
        xhr.ontimeout = () => {
          reject(Object.assign(new Error("Request timeout"), { isTimeout: true }));
        };
      }
      let aborted = false;
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          aborted = true;
          xhr.abort();
          reject(new Error("Request aborted"));
        });
      }
      xhr.onload = () => {
        if (aborted) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          let data;
          const contentType = xhr.getResponseHeader("content-type") || "";
          try {
            if (contentType.includes("application/json")) {
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
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => {
        if (!aborted) reject(new Error("Request aborted"));
      };
      xhr.send(body || null);
    });
  }
  async function performRequestOnce(options) {
    const fullUrl = buildFullUrl(options.url, options.query, baseURL);
    const isGet = isGetRequest(options);
    const canUseCache = isGet && cacheTTL > 0 && !options.onDownloadProgress;
    if (canUseCache) {
      const cachedData = tryGetFromCache(fullUrl, cacheTTL, cache);
      if (cachedData !== null) {
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
    const method = (options.method || "GET").toUpperCase();
    const hasBody = body !== void 0;
    const needsUploadProgress = options.onUploadProgress && ["POST", "PUT", "PATCH"].includes(method);
    if (needsUploadProgress && hasBody) {
      const data = await performUploadWithProgress({
        ...options,
        method,
        url: fullUrl,
        headers: mergedHeaders,
        body
      });
      return data;
    }
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
        signal: effectiveSignal
      });
      let processedResponse = response;
      if (afterResponse) {
        const modified = await afterResponse(response, options);
        if (modified) processedResponse = modified;
      }
      if (!processedResponse.ok) {
        throw new HttpError(processedResponse.status, processedResponse.statusText, processedResponse);
      }
      const onDownloadProgress = options.onDownloadProgress;
      const hasProgress = onDownloadProgress && typeof onDownloadProgress === "function";
      let total = Number(processedResponse.headers.get("content-length")) || 0;
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
              total: total || loaded,
              // если total неизвестен — используем loaded
              percent: total ? Math.round(loaded / total * 100) : 0,
              estimatedTotal: total > 0,
              fromCache: false
            });
          }
        }
      }
      const blob = new Blob(chunks);
      let data;
      const contentType = processedResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = JSON.parse(await blob.text());
      } else {
        data = await blob.text();
      }
      if (canUseCache) {
        saveToCache(fullUrl, data, cache);
      }
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
        await afterResponse(null, options, err).catch(() => {
        });
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  async function request(options) {
    let currentOptions = { ...options };
    if (beforeRequest) {
      currentOptions = await beforeRequest(currentOptions) || currentOptions;
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
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
      }
    }
  }
  return {
    request,
    get: (url, opts = {}) => request({ method: "GET", url, ...opts }),
    post: (url, body, opts = {}) => request({ method: "POST", url, body, ...opts }),
    put: (url, body, opts = {}) => request({ method: "PUT", url, body, ...opts }),
    patch: (url, body, opts = {}) => request({ method: "PATCH", url, body, ...opts }),
    del: (url, opts = {}) => request({ method: "DELETE", url, ...opts })
  };
}
export {
  HttpError,
  createClient
};
//# sourceMappingURL=index.mjs.map