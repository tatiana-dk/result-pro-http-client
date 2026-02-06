var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  HttpError: () => HttpError,
  createClient: () => createClient
});
module.exports = __toCommonJS(index_exports);

// src/utils.js
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

// src/client.js
function createClient(config = {}) {
  const {
    baseURL = "",
    headers: defaultHeaders = {},
    timeout,
    beforeRequest,
    afterResponse
  } = config;
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
  async function request(options) {
    let currentOptions = {
      ...options
    };
    if (beforeRequest) {
      currentOptions = await beforeRequest(currentOptions) || currentOptions;
    }
    const retry = currentOptions.retry ?? {};
    const maxAttempts = retry.maxAttempts ?? 1;
    const baseDelayMs = retry.baseDelayMs ?? 1e3;
    const maxDelayMs = retry.maxDelayMs ?? 1e4;
    const backoffFactor = retry.backoffFactor ?? 2;
    const shouldEnableRetry = maxAttempts > 1;
    let attempt = 1;
    let lastError;
    while (true) {
      let fullUrl = currentOptions.url;
      if (currentOptions.query) {
        fullUrl = buildUrl(fullUrl, currentOptions.query);
      }
      if (!fullUrl.startsWith("http")) {
        fullUrl = baseURL + (fullUrl.startsWith("/") ? "" : "/") + fullUrl;
      }
      const mergedHeaders = {
        "Content-Type": "application/json",
        ...defaultHeaders,
        ...currentOptions.headers
      };
      let body = void 0;
      if (currentOptions.body !== void 0) {
        if (mergedHeaders["Content-Type"] === "application/json") {
          body = JSON.stringify(currentOptions.body);
        } else {
          body = currentOptions.body;
        }
      }
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
          method: currentOptions.method || "GET",
          headers: mergedHeaders,
          body,
          signal: effectiveSignal
        });
        if (afterResponse) {
          const modified = await afterResponse(response, currentOptions);
          if (modified) response = modified;
        }
        if (!response.ok) {
          throw new HttpError(response.status, response.statusText, response);
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return await response.json();
        }
        return await response.text();
      } catch (err) {
        lastError = err;
        if (afterResponse) {
          await afterResponse(null, currentOptions, err).catch(() => {
          });
        }
        const normalizedError = normalizeError(err, signal, timeoutId);
        const isRetryable = normalizedError.isTimeout || normalizedError.isNetwork || normalizedError.status >= 500 && normalizedError.status < 600 || normalizedError.status === 429;
        const isLastAttempt = attempt >= maxAttempts;
        if (!shouldEnableRetry || !isRetryable || isLastAttempt) {
          throw normalizedError;
        }
        const delay = Math.min(
          baseDelayMs * Math.pow(backoffFactor, attempt - 1),
          maxDelayMs
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }
  return {
    request,
    // Короткие методы — основные действия
    get(url, options = {}) {
      return request({ method: "GET", url, ...options });
    },
    post(url, body, options = {}) {
      return request({ method: "POST", url, body, ...options });
    },
    put(url, body, options = {}) {
      return request({ method: "PUT", url, body, ...options });
    },
    patch(url, body, options = {}) {
      return request({ method: "PATCH", url, body, ...options });
    },
    del(url, options = {}) {
      return request({ method: "DELETE", url, ...options });
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HttpError,
  createClient
});
//# sourceMappingURL=index.cjs.map