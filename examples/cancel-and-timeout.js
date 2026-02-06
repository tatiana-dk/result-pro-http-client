import { createClient } from 'quickrequest'

const api = createClient({ baseURL: 'https://httpbin.org' })

async function main() {
  const controller = new AbortController()

  setTimeout(() => {
    console.log('Отменяем запрос...')
    controller.abort()
  }, 1500)

  try {
    await api.get('/delay/5', {
      timeout: 3000,
      signal: controller.signal
    })
    console.log('Успех (не должно вывестись)')
  } catch (err) {
    console.log('Ожидаемая ошибка:', err.message)
    console.log('isTimeout:', err.isTimeout)
    console.log('isAbort:', err.isAbort)
  }
}

main()