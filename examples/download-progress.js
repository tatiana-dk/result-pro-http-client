import { createClient } from 'quickrequest'

const api = createClient({
    baseURL: 'https://api.example.com'
});

api.get('/large-file.zip', {
    onDownloadProgress: ({ loaded, total, percent, estimatedTotal }) => {
        console.log(`Скачано: ${formatBytes(loaded)} / ${total ? formatBytes(total) : 'неизвестно'}`);

        if (estimatedTotal) {
            console.log(`Прогресс: ${percent}%`);
            // progressBar.value = percent;
        } else {
            console.log(`Получено: ${formatBytes(loaded)} (размер неизвестен)`);
        }
    }
})
.then(data => {
    console.log("Файл полностью загружен");
})
.catch(err => console.error("Ошибка:", err));

function formatBytes(bytes) {
    if (!bytes) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}