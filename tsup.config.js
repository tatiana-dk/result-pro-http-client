import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.js'],          // или src/client.js если без TS
  format: ['cjs', 'esm'],                      // генерирует .d.ts
  clean: true,                      // очищает dist перед сборкой
  sourcemap: true,
  minify: false,                    // для библиотеки обычно не минифицируют
  target: 'es2020',
  outDir: 'dist',
})