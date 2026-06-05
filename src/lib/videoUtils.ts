export class VideoRecorder {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private intervalId: number | null = null;

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  async start(onFrame: (base64: string) => void) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      
      this.canvas.width = this.videoElement.videoWidth || 640;
      this.canvas.height = this.videoElement.videoHeight || 480;

      this.intervalId = window.setInterval(() => {
        if (this.ctx && this.videoElement.readyState >= 2) {
          this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
          const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5);
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            onFrame(base64);
          }
        }
      }, 1000); // 1 fps
    } catch (e) {
      console.error("Camera access denied or error:", e);
      throw e;
    }
  }

  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
  
  getVideoElement() {
    return this.videoElement;
  }
}
