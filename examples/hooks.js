import { createClient } from 'quickrequest'

const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',

  beforeRequest: (opts) => {
    console.log(`→ Запрос: ${opts.method || 'GET'} ${opts.url}`)
    opts._startTime = Date.now()
    return opts
  },

  afterResponse: async (res, opts) => {
    const ms = Date.now() - opts._startTime
    console.log(`← ${res.status} за ${ms} мс`)
    return res
  }
})

async function main() {
  await api.get('/todos/1')
}

main()