import { createClient } from 'quickrequest'

const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
})

async function main() {
  try {
    const posts = await api.get('/posts', { query: { _limit: 5 } })
    console.log('Первые 5 постов:', posts)
  } catch (err) {
    console.error('Ошибка:', err.message, err.status)
  }
}

main()