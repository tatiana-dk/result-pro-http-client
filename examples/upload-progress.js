import { createClient } from 'quickrequest'

const api = createClient({
    baseURL: 'https://api.example.com'
});

let fileInput, progressBar, progressText;

const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('title', 'Моё фото');

api.post('/upload', formData, {
    headers: {
        'Authorization': `Bearer ${token}`
        // НЕ ставим Content-Type вручную — FormData сам ставит multipart/form-data
    },
    onUploadProgress: ({ percent, loaded, total }) => {
        console.log(`Загрузка: ${percent}% (${loaded} / ${total} байт)`);
        progressBar.value = percent;
        progressText.textContent = `${percent}%`;
    }
})
.then(response => {
    console.log('Успешно загружено:', response);
})
.catch(err => {
    console.error('Ошибка загрузки:', err);
});