# QuickRequest

**Быстрые и удобные HTTP-запросы на чистом `fetch` без лишних зависимостей.**

Лёгкая обёртка над нативным `fetch`, которая решает самые частые боли:
- много boilerplate-кода
- неудобная обработка ошибок
- отсутствие встроенных таймаута и отмены
- повторные запросы при сетевых сбоях

### Почему стоит выбрать QuickRequest

- Очень маленький размер (~2–4 КБ после минификации и gzip)
- Ноль зависимостей
- Полная поддержка ESM и CommonJS
- Удобные короткие методы: `.get()`, `.post()`, `.put()`, `.patch()`, `.del()`
- Встроенный таймаут, отмена запросов, хуки и повторы
- Кастомные ошибки `HttpError` с понятными флагами

### Установка

```bash
npm install quickrequest
# или
yarn add quickrequest
# или
pnpm add quickrequest
```

### Базовое использование

```javascript
import { createClient } from 'quickrequest'

const api = createClient({
  baseURL: 'https://api.example.com/v1',
  headers: {
    'Authorization': 'Bearer your-token',
    'Accept': 'application/json'
  },
  timeout: 10000, // 10 секунд по умолчанию
})

// GET
const users = await api.get('/users', {
  query: { limit: 20, page: 1 }
})

// POST
const newUser = await api.post('/users', {
  name: 'Anna',
  email: 'anna@example.com'
})

// PUT / PATCH / DELETE
await api.put('/profile', { name: 'Anna Smith' })
await api.patch('/settings', { theme: 'dark' })
await api.del('/posts/123')
```

###Таймаут и отмена запроса

```javascript
// Глобальный таймаут при создании клиента
const api = createClient({ timeout: 8000 })

// Локальный таймаут для конкретного запроса
await api.get('/slow-endpoint', { timeout: 5000 })

// Отмена запроса
const controller = new AbortController()

const promise = api.get('/search', {
  query: { q: 'iphone' },
  signal: controller.signal
})

setTimeout(() => {
  controller.abort() // отменяем через 2 секунды
}, 2000)
```

### Хуки (перехватчики)

```javascript
const api = createClient({
  beforeRequest: (options) => {
    // Добавляем токен перед каждым запросом
    options.headers = {
      ...options.headers,
      'X-Request-ID': crypto.randomUUID()
    }
    return options
  },

  afterResponse: async (response, options) => {
    const ms = Date.now() - options._startTime
    console.log(`[${options.method}] ${options.url} — ${response.status} (${ms}ms)`)
    return response
  }
})
```

### Повторы запросов (retry)

```javascript
await api.get('/unstable-api', {
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    backoffFactor: 2       // задержки: 1s → 2s → 4s
  }
})
```

### Кэширование GET запросов

```javascript
const api = createClient({
  baseURL: 'https://api.example.com',
  cacheTTL: 30 * 1000
})
```

### Progress для upload

```javascript
await api.post('/upload', formData, {
  onUploadProgress: ({ percent, loaded, total }) => {
    console.log(`Загрузка: ${percent}% (${loaded} / ${total} байт)`);
  }
})
```

### Progress для download

```javascript
await api.get('/large-file.zip', {
  onDownloadProgress: ({ loaded, total, percent, estimatedTotal }) => {
    console.log(`Скачано: ${formatBytes(loaded)} / ${total ? formatBytes(total) : 'неизвестно'}`);
  }
})
```

### Размер и преимущества

- ~3.2 КБ (minified + gzipped) — почти в 10 раз легче axios
- Никаких зависимостей
- Работает в браузере и Node.js
- Полная поддержка AbortController и таймаутов
- Читаемые ошибки через класс HttpError
- Простые и предсказуемые хуки

### Лицензия

MIT
