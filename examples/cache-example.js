// examples/cache-example.js
import { createClient } from '../src/client.js'  // или 'quickrequest' если уже установлен

// Создаём клиента с кэшированием на 30 секунд
const api = createClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
  
  // Включаем кэш на 30 секунд
  cacheTTL: 30 * 1000,  // 30 секунд
  
  // Опционально: логируем попадания и сохранения в кэш
  beforeRequest: (opts) => {
    opts._startTime = Date.now();
    return opts;
  },
  
  afterResponse: async (res, opts) => {
    if (opts.method === 'GET') {
      const ms = Date.now() - (opts._startTime || 0);
      console.log(`[${res.status}] ${opts.url} — ${ms}ms`);
    }
    return res;
  }
});

async function main() {
  console.log("=== Первый запрос — должен пойти в сеть ===");
  const start1 = Date.now();
  
  const todos1 = await api.get('/todos/1');
  console.log("Получено:", todos1.title);
  console.log(`Время: ${Date.now() - start1} мс\n`);

  // ────────────────────────────────────────────────
  
  console.log("=== Второй запрос сразу после первого ===");
  console.log("Ожидаем: должен взяться из кэша (очень быстро)");
  
  const start2 = Date.now();
  const todos2 = await api.get('/todos/1');
  console.log("Получено:", todos2.title);
  console.log(`Время: ${Date.now() - start2} мс\n`);

  // ────────────────────────────────────────────────
  
  console.log("Ждём 35 секунд, чтобы кэш устарел...");
  await new Promise(r => setTimeout(r, 35_000));

  // ────────────────────────────────────────────────
  
  console.log("=== Третий запрос после истечения кэша ===");
  console.log("Ожидаем: снова пойдёт в сеть");
  
  const start3 = Date.now();
  const todos3 = await api.get('/todos/1');
  console.log("Получено:", todos3.title);
  console.log(`Время: ${Date.now() - start3} мс\n`);

  // ────────────────────────────────────────────────
  
  console.log("=== Запрос с другим ID — кэш не используется ===");
  const todosOther = await api.get('/todos/2');
  console.log("Получено:", todosOther.title);
}

main().catch(err => {
  console.error("Ошибка:", err.message);
  if (err instanceof HttpError) {
    console.log("Статус:", err.status);
  }
});