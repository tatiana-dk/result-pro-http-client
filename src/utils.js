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