import { createClient, HttpError } from './client.js';

const api = createClient({
  baseURL: 'https://httpbin.org',
  headers: {  },
  timeout: 8000,
});

// api.get('/comments', {query: {postId: 1}})
//   .then(data => console.log(data))
//   .catch(err => console.error(err));

// api.get('/status/404')
//   .then(data => console.log(data))
//   .catch(handleError);

api.get('/status/500')
  .then(data => console.log(data))
  .catch(handleError);

function handleError(err) {
    if (err instanceof HttpError) {
        if (err.isAbort)          console.log('Отменено или таймаут');
        else if (err.isNetwork)   console.log('Нет сети');
        else if (err.status >= 400 && err.status < 500)
            console.log('Ошибка клиента:', err.status);
        else
            console.log('Ошибка сервера:', err.status);
    }
}