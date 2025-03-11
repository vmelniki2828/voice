import { useMicVAD } from '@ricky0123/vad-react';
import { useEffect, useRef, useState } from 'react';

// Функція для конвертації Float32Array в WAV Blob
const float32ToWavBlob = (audioBuffer, sampleRate = 16000) => {
  const buffer = new ArrayBuffer(44 + audioBuffer.length * 2);
  const view = new DataView(buffer);

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const writeUint16 = (view, offset, value) => {
    view.setUint16(offset, value, true);
  };

  const writeUint32 = (view, offset, value) => {
    view.setUint32(offset, value, true);
  };

  writeString(view, 0, 'RIFF');
  writeUint32(view, 4, 36 + audioBuffer.length * 2);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  writeUint32(view, 16, 16);
  writeUint16(view, 20, 1);
  writeUint16(view, 22, 1);
  writeUint32(view, 24, sampleRate);
  writeUint32(view, 28, sampleRate * 2);
  writeUint16(view, 32, 2);
  writeUint16(view, 34, 16);
  writeString(view, 36, 'data');
  writeUint32(view, 40, audioBuffer.length * 2);

  const offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, audioBuffer[i]));
    view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

// Функція для конвертації Blob в base64
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const App = () => {
  const ws = useRef(null);
  const [audioUrls, setAudioUrls] = useState([]);  // Масив для зберігання URL всіх аудіофайлів
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // Установите соединение с WebSocket-сервером
    ws.current = new WebSocket('ws://localhost:5000');
    ws.current.onopen = () => console.log('WebSocket соединение установлено');
    ws.current.onclose = () => console.log('WebSocket соединение закрыто');
    ws.current.onerror = (error) => console.error('WebSocket ошибка:', error);

    // Закрытие соединения при размонтировании компонента
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const vad = useMicVAD({
    onSpeechEnd: async (audio) => {
      console.log('Пользователь перестал говорить');
      const wavBlob = float32ToWavBlob(audio);
      const base64Audio = await blobToBase64(wavBlob);

      // Отправка данных через WebSocket
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ audio: base64Audio }));
      } else {
        console.error('WebSocket не подключен');
      }

      // Створення URL для аудіо та додавання в масив
      const audioUrl = URL.createObjectURL(wavBlob);
      setAudioUrls((prevAudioUrls) => [...prevAudioUrls, audioUrl]);
      setIsSpeaking(false);
    },
    onSpeechStart: () => {
      console.log('Пользователь начал говорить');
      setIsSpeaking(true);
    },
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h1>Голосовий інтерфейс</h1>
      <div>
        {isSpeaking ? <p>Пользователь говорит...</p> : <p>Пользователь перестал говорить</p>}
      </div>

      {/* Виведення всіх записаних аудіофайлів */}
      {audioUrls.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h2>Записані аудіофайли:</h2>
          {audioUrls.map((url, index) => (
            <div key={index} style={{ marginBottom: '10px' }}>
              <audio controls>
                <source src={url} type="audio/wav" />
                Ваш браузер не підтримує елемент <code>audio</code>.
              </audio>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
