export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private monitorGain: GainNode | null = null;

  async start(onData: (base64: string) => void) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const buffer = new ArrayBuffer(pcm16.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(i * 2, pcm16[i], true);
      }

      this.port.postMessage(buffer, [buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletUrl);

      this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      this.monitorGain = this.audioContext.createGain();
      this.monitorGain.gain.value = 0;

      this.processor.port.onmessage = (e) => {
        const buffer = e.data;
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        onData(btoa(binary));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.monitorGain);
      this.monitorGain.connect(this.audioContext.destination);
    } catch (e) {
      console.error("Microphone access denied or error:", e);
      throw e;
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.monitorGain) {
      this.monitorGain.disconnect();
      this.monitorGain = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.audioContext.currentTime;
    }
  }

  play(base64: string) {
    if (!this.audioContext) return 0;
    
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new DataView(buffer);
    for (let i = 0; i < binary.length; i++) {
      view.setUint8(i, binary.charCodeAt(i));
    }
    
    const pcm16 = new Int16Array(buffer);
    const audioBuffer = this.audioContext.createBuffer(1, pcm16.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
    
    const startTime = Math.max(this.nextPlayTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;
    return audioBuffer.duration;
  }

  stop() {
    this.clearQueue();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  clearQueue() {
    this.sources.forEach(source => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    });
    this.sources.clear();
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
  }

  getQueuedDurationMs() {
    if (!this.audioContext) return 0;
    return Math.max(0, this.nextPlayTime - this.audioContext.currentTime) * 1000;
  }
}
