import { useMicVAD } from '@ricky0123/vad-react';
import { useEffect, useRef, useState } from 'react';


let audioContext;
let source;


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
  const audioRef = useRef(new Audio());
  const [audioUrls, setAudioUrls] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [vadActive, setVadActive] = useState(false);

  async function playAudio(audioData) {  
    setVadActive(false);
  
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  
    let arrayBuffer = await audioData.arrayBuffer();
    let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
  
    source.onended = () => {
        setVadActive(true);
    };
  
    source.start();
  }

  const connectWebSocket = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      ws.current = new WebSocket('ws://localhost:8000/call/v1/');
      ws.current.onopen = () => {
        console.log('WebSocket соединение установлено');
        setIsConnected(true);
        setVadActive(true);
      };
      ws.current.onclose = () => {
        console.log('WebSocket соединение закрыто');
        setIsConnected(false);
        setVadActive(false);
      };
      ws.current.onerror = (error) => console.error('WebSocket ошибка:', error);

      ws.current.onmessage = async (event) => {
        try {
          console.log(event);
          let audioBlob = event.data;
          await playAudio(audioBlob);
        } catch (error) {
          console.error('Ошибка обработки аудио:', error);
        }
      };
    }
  };

  const vad = useMicVAD({
    onSpeechEnd: async (audio) => {
      if (!isConnected || !vadActive) return;
      console.log('Пользователь перестал говорить');
      const wavBlob = float32ToWavBlob(audio);
      const base64Audio = await blobToBase64(wavBlob);
      
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ audio: base64Audio }));
      } else {
        console.error('WebSocket не подключен');
      }

      const audioUrl = URL.createObjectURL(wavBlob);
      setAudioUrls((prevAudioUrls) => [...prevAudioUrls, audioUrl]);
      setIsSpeaking(false);
    },
    onSpeechStart: () => {
      if (!isConnected || !vadActive) return;
      console.log('Пользователь начал говорить');
      setIsSpeaking(true);
    },
    enabled: vadActive,
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
