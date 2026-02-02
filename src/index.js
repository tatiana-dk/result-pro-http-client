import { createClient, HttpError } from './client.js';

const api = createClient({
  baseURL: 'https://httpbin.org',
  headers: {  },
  timeout: 3000,
//   beforeRequest: (options) => {
//         const token = 'token';
//         if (token) {
//             options.headers = {
//                 ...options.headers,
//                 Authorization: `Bearer ${token}`,
//             };
//         }

//         options._startTime = Date.now();

//         return options;
//     },
//     afterResponse: async (response, options) => {
//         const duration = Date.now() - options._startTime;
//         const method = (options.method || 'GET').toUpperCase();
//         const url = options.url;
//         const status = response?.status || '—';

//         console.log(`[${method}] ${url} — ${status} (${duration} мс)`);

//         return response;
//     },
});

// api.get('/comments', {query: {postId: 1}})
//   .then(data => console.log(data))
//   .catch(err => console.error(err));

// api.get('/status/404')
//   .then(data => console.log(data))
//   .catch(handleError);

// const myController = new AbortController();

// api.get('/delay/5', { signal: myController.signal })
//   .then(data => console.log(data))
//   .catch(handleError);

// setTimeout(() => {myController.abort()}, 2000);

// api.get('/bearer')
//     .then(data => console.log(data))
//     .catch(handleError);

api.post('/post', {
  retry: {
    maxAttempts: 4,
    baseDelayMs: 800,
    maxDelayMs: 15000,
    backoffFactor: 2.5
  }
})
    .then(data => console.log(data))
    .catch(handleError);

function handleError(err) {
    if (err instanceof HttpError) {
        if (err.isTimeout) console.log('Таймаут');
        else if (err.isAbort)   console.log('Отменено');
        else if (err.isNetwork)   console.log('Нет сети');
        else if (err.status >= 400 && err.status < 500)
            console.log('Ошибка клиента:', err.status);
        else
            console.log('Ошибка сервера:', err.status);
    }
}