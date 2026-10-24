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

export function playAudioChunk(audioCtx: AudioContext, base64: string, destination: AudioNode = audioCtx.destination) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const buffer = audioCtx.createBuffer(1, bytes.length / 2, 24000);
  const data = buffer.getChannelData(0);
  const dataView = new DataView(bytes.buffer);
  for (let i = 0; i < data.length; i++) {
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
  };
  
  nextStartTime += buffer.duration;
}

export function resetAudioPlayback() {
  scheduledSources.forEach(source => {
    try {
      source.stop();
    } catch (e) {
      // ignore already stopped sources
    }
  });
  scheduledSources = [];
  nextStartTime = 0;
}
