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

    ws.on('message', (message) => {
        console.log('Получено сообщение:', message);
    });

    ws.on('close', () => {
        console.log('Клиент отключен');
    });
});

server.listen(5000, () => {
    console.log('Сервер WebSocket запущен на порту 5000');
});
