import { createClient } from './client.js';

const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
  headers: {  },
  timeout: 8000,
});

// api.get('/comments', {query: {postId: 1}})
//   .then(data => console.log(data))
//   .catch(err => console.error(err));

api.post('/posts', {post: 'The post', date: Date.now(), author: 'Tatiana'})
  .then(data => console.log(data))
  .catch(err => console.error(err));