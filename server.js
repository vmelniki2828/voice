const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

wss.on('connection', (ws) => {
    console.log('Клиент подключен');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.audio) {
                console.log('Получена аудиозапись от клиента');

                // Отправляем обратно тот же base64-encoded аудиофайл
                ws.send(JSON.stringify({ audio: data.audio }));
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        console.log('Клиент отключен');
    });
});

server.listen(8000, () => {
    console.log('Сервер WebSocket запущен на порту 8000');
});
