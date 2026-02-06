// src/utils/cache.js

/**
 * Пытается получить данные из кэша.
 * Возвращает данные, если они есть и не просрочены, иначе null.
 *
 * @param {string} url - ключ кэша (обычно полный URL)
 * @param {number} cacheTTL - время жизни кэша в миллисекундах
 * @param {Map} cache - объект кэша (Map)
 * @returns {any | null} данные из кэша или null
 */
export function tryGetFromCache(url, cacheTTL, cache) {
  if (cacheTTL <= 0) return null;

  const cached = cache.get(url);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age < cacheTTL) {
    console.debug(`[cache hit] ${url} (age: ${Math.round(age / 1000)} сек)`);
    return cached.data;
  }

  console.debug(`[cache expired] ${url} (age: ${Math.round(age / 1000)} сек)`);
  cache.delete(url);
  return null;
}

/**
 * Сохраняет данные в кэш.
 *
 * @param {string} url - ключ кэша
 * @param {any} data - данные для сохранения
 * @param {Map} cache - объект кэша
 */
export function saveToCache(url, data, cache) {
  cache.set(url, {
    data,
    timestamp: Date.now(),
  });
  console.debug(`[cache saved] ${url}`);
}