// test/setup.ts
// Mock Web Audio API for testing
(global as any).AudioContext = class MockAudioContext {
  destination = {};
  createGain() {
    return {
      gain: { value: 0 },
      connect: jest.fn(),
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn()
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn()
    };
  }
  createBuffer() {
    return {
      duration: 10,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(1000)
    };
  }
  decodeAudioData() {
    return Promise.resolve(this.createBuffer());
  }
  startRendering() {
    return Promise.resolve(this.createBuffer());
  }
};

(global as any).OfflineAudioContext = class MockOfflineAudioContext extends (global as any).AudioContext {
  constructor() {
    super();
  }
};

// Mock fetch for testing
(global as any).fetch = jest.fn();

// Mock Blob
(global as any).Blob = class MockBlob {
  size = 1024;
  type = 'audio/wav';
  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(1024));
  }
  constructor(parts?: any[], options?: any) {
    if (parts) {
      this.size = parts.reduce((sum, part) => sum + part.length, 0);
    }
    if (options?.type) {
      this.type = options.type;
    }
  }
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
(global as any).localStorage = localStorageMock;