export function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

let nextStartTime = 0;
let scheduledSources: AudioBufferSourceNode[] = [];

export function playAudioChunk(
  audioCtx: AudioContext,
  base64: string,
  destination: AudioNode = audioCtx.destination,
  onComplete?: () => void
): number {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const binary = window.atob(base64);
  const len = binary.length;
  const rawBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    rawBytes[i] = binary.charCodeAt(i);
  }

  // Strip 44-byte RIFF WAV header if present (from unary Gemini 3.8 TTS output)
  const isWavHeader =
    rawBytes.length > 44 &&
    rawBytes[0] === 0x52 && // 'R'
    rawBytes[1] === 0x49 && // 'I'
    rawBytes[2] === 0x46 && // 'F'
    rawBytes[3] === 0x46;   // 'F'
  const pcmBytes = isWavHeader ? rawBytes.subarray(44) : rawBytes;
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);
  if (sampleCount <= 0) {
    onComplete?.();
    return 0;
  }

  const buffer = audioCtx.createBuffer(1, sampleCount, 24000);
  const data = buffer.getChannelData(0);
  const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = dataView.getInt16(i * 2, true) / 0x8000;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);

  if (nextStartTime < audioCtx.currentTime) {
    nextStartTime = audioCtx.currentTime;
  }
  source.start(nextStartTime);

  scheduledSources.push(source);
  source.onended = () => {
    scheduledSources = scheduledSources.filter(s => s !== source);
    if (scheduledSources.length === 0) {
      onComplete?.();
    }
  };

  nextStartTime += buffer.duration;
  return buffer.duration;
}

export function resetAudioPlayback() {
  scheduledSources.forEach(source => {
    try {
      source.stop();
    } catch {
      // ignore already stopped sources
    }
  });
  scheduledSources = [];
  nextStartTime = 0;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices();
    };
  } catch {
    // ignore
  }
}

export function selectNaturalFemaleBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const preferredFemaleNames = [
    'Google US English',
    'Google UK English Female',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Microsoft Sonia Online (Natural)',
    'Samantha',
    'Ava (Enhanced)',
    'Allison (Enhanced)',
    'Victoria',
    'Karen',
    'Moira',
    'Tessa',
    'Zira',
    'Female',
  ];

  for (const name of preferredFemaleNames) {
    const match = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }

  const anyFemaleEn = voices.find(
    v =>
      v.lang.startsWith('en') &&
      /female|woman|samantha|victoria|karen|aria|jenny|zira|google/i.test(v.name)
  );
  if (anyFemaleEn) return anyFemaleEn;

  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

export function speakFallbackFemaleVoice(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/---[\s\S]*$/g, '')
      .replace(/[*#_`~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (!cleanText) {
      onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const femaleVoice = selectNaturalFemaleBrowserVoice();
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.06;
    utterance.volume = 1.0;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);

    // Safeguard for browsers that randomly pause synthesis
    setTimeout(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 120);
  } catch {
    onEnd?.();
  }
}

export async function speakWithEclipseTTS(
  text: string,
  audioCtx?: AudioContext | null,
  destination?: AudioNode,
  onEnd?: () => void
): Promise<boolean> {
  const cleanText = text
    .replace(/---[\s\S]*$/g, '')
    .replace(/[*#_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  if (!cleanText) {
    onEnd?.();
    return false;
  }

  try {
    let customApiKey: string | undefined;
    try {
      const storedKey = localStorage.getItem('ztcd_gemini_api_key');
      if (storedKey && storedKey.trim()) customApiKey = storedKey.trim();
    } catch {
      // ignore
    }

    const res = await fetch('/api/gemini/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {}),
      },
      body: JSON.stringify({
        text: cleanText.slice(0, 600),
        voice: 'Kore', // Eclipse Natural Female Voice
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.audio && audioCtx) {
        playAudioChunk(audioCtx, data.audio, destination || audioCtx.destination, onEnd);
        return true;
      }
    }
  } catch {
    // Fall back to natural female browser voice if offline or quota exceeded
  }

  speakFallbackFemaleVoice(cleanText, onEnd);
  return false;
}

