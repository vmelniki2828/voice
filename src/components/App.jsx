import { useMicVAD } from '@ricky0123/vad-react';
import { useRef, useState } from 'react';

let audioContext;

const float32ToWavBlob = (audioBuffer, sampleRate = 16000) => {
  const buffer = new ArrayBuffer(44 + audioBuffer.length * 2);
  const view = new DataView(buffer);

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
  const writeUint32 = (view, offset, value) => view.setUint32(offset, value, true);

  writeString(view, 0, 'RIFF');
  writeUint32(view, 4, 36 + audioBuffer.length * 2);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  writeUint32(view, 16, 16);
  writeUint16(view, 20, 1); // PCM формат
  writeUint16(view, 22, 1); // Моно
  writeUint32(view, 24, sampleRate);
  writeUint32(view, 28, sampleRate * 2); // Байтрейт
  writeUint16(view, 32, 2); // Блок-выравнивание
  writeUint16(view, 34, 16); // Биты на отсчет
  writeString(view, 36, 'data');
  writeUint32(view, 40, audioBuffer.length * 2);

  const offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, audioBuffer[i]));
    view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

export const App = () => {
  const ws = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioSource, setAudioSource] = useState(null);
  const [audioUrls, setAudioUrls] = useState([]);

  const stopAudio = () => {
    if (audioSource && isAudioPlaying) {
      try {
        audioSource.stop();
        setIsAudioPlaying(false);
        setAudioSource(null);
      } catch (e) {
        console.error('Ошибка при остановке аудио:', e);
      }
    }
  };

  const playAudio = async (audioData) => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const arrayBuffer = await audioData.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    if (isAudioPlaying && audioSource) stopAudio();

    const newSource = audioContext.createBufferSource();
    newSource.buffer = audioBuffer;
    newSource.connect(audioContext.destination);

    newSource.onended = () => {
      setIsAudioPlaying(false);
      setAudioSource(null);
    };

    try {
      newSource.start();
      setIsAudioPlaying(true);
      setAudioSource(newSource);
    } catch (error) {
      console.error('Ошибка при воспроизведении аудио:', error);
    }
  };

  const connectWebSocket = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.log("Создание нового WebSocket соединения...");
      ws.current = new WebSocket('wss://call.qodeq.net/call/v1/ws');
  
      ws.current.onopen = () => {
        console.log("WebSocket подключен!");
        setIsConnected(true);
      };
  
      ws.current.onclose = (event) => {
        console.log("WebSocket отключен. Код:", event.code, "Причина:", event.reason);
        setIsConnected(false);
      };
  
      ws.current.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
      };
  
      ws.current.onmessage = async (event) => {
        console.log("Получено сообщение:", event.data);
  
        try {
          const messageData = JSON.parse(event.data);
          if (!messageData.audio) {
            console.log("Сообщение не содержит аудио");
            return;
          }
  
          console.log("Декодирование аудиофайла...");
          const byteCharacters = atob(messageData.audio);
          const byteArray = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
          }
  
          const audioBlob = new Blob([byteArray], { type: 'audio/wav' });
  
          console.log("Попытка воспроизведения аудио...");
          if (!isSpeaking) {
            await playAudio(audioBlob);
            console.log("Аудио воспроизведено");
          }
        } catch (error) {
          console.error('Ошибка обработки аудио:', error);
        }
      };
    }
  };
  

  useMicVAD({
    onSpeechEnd: async (audio) => {
      if (!isConnected) return;

      const wavBlob = float32ToWavBlob(audio);
      const base64Audio = await blobToBase64(wavBlob);

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ audio: base64Audio }));
      }

      setIsSpeaking(false);

      const audioUrl = URL.createObjectURL(wavBlob);
      setAudioUrls((prevUrls) => [...prevUrls, audioUrl]);
    },
    onSpeechStart: () => {
      if (!isConnected) return;

      stopAudio();
      setIsSpeaking(true);
    },
    enabled: isConnected,
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h1>Голосовой интерфейс</h1>
      <button onClick={connectWebSocket} disabled={isConnected}>
        {isConnected ? 'WebSocket подключен' : 'Подключиться к WebSocket'}
      </button>
      <div>
        {isSpeaking ? <p>Пользователь говорит...</p> : <p>Пользователь перестал говорить</p>}
      </div>
      <button onClick={stopAudio} disabled={!isAudioPlaying}>Остановить аудио</button>

      {audioUrls.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h2>Записанные аудиофайлы:</h2>
          {audioUrls.map((url, index) => (
            <div key={index} style={{ marginBottom: '10px' }}>
              <audio controls>
                <source src={url} type="audio/wav" />
                Ваш браузер не поддерживает элемент <code>audio</code>.
              </audio>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
