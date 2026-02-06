import { createClient } from 'quickrequest'

const api = createClient({ baseURL: 'https://httpbin.org' })

async function main() {
  try {
    const data = await api.get('/status/503', {
      retry: {
        maxAttempts: 3,
        baseDelayMs: 800,
        backoffFactor: 2
      }
    })
    console.log('Успех после повторов:', data)
  } catch (err) {
    console.error('Все попытки неудачны:', err.message, err.status)
  }
}

main()