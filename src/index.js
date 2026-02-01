import { createClient, HttpError } from './client.js';

const api = createClient({
  baseURL: 'https://httpbin.org',
  headers: {  },
  timeout: 3000,
});

// api.get('/comments', {query: {postId: 1}})
//   .then(data => console.log(data))
//   .catch(err => console.error(err));

// api.get('/status/404')
//   .then(data => console.log(data))
//   .catch(handleError);

const myController = new AbortController();

api.get('/delay/5', { signal: myController.signal })
  .then(data => console.log(data))
  .catch(handleError);

setTimeout(() => {myController.abort()}, 2000);

setTimeout(() => {
    api.get('/delay/5')
        .then(data => console.log(data))
        .catch(handleError);
}, 3000);

setTimeout(() => {
    api.get('/anything')
        .then(data => console.log(data))
        .catch(handleError);
}, 3000);

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