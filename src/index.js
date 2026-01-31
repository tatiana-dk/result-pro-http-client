import { createClient } from './client.js';

const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
  headers: {  },
  timeout: 8000,
});

api.get('/posts')
  .then(data => console.log(data))
  .catch(err => console.error(err));
