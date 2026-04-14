import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudioParam {
  value = 0
  setTargetAtTime(value: number): void {
    this.value = value
  }
  setValueAtTime(value: number): void {
    this.value = value
  }
  exponentialRampToValueAtTime(value: number): void {
    this.value = value
  }
}

class FakeGainNode {
  gain = new FakeAudioParam()
  connect = vi.fn()
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null = null
  loop = false
  onended: (() => void) | null = null
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeBiquadFilterNode {
  type: BiquadFilterType = 'lowpass'
  frequency = new FakeAudioParam()
  Q = new FakeAudioParam()
  connect = vi.fn()
}

class FakeOscillatorNode {
  type: OscillatorType = 'sine'
  frequency = new FakeAudioParam()
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeAudioBuffer {
  readonly duration = 0
  readonly length: number
  readonly numberOfChannels: number
  readonly sampleRate: number

  private readonly channels: Float32Array[]

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels
    this.length = length
    this.sampleRate = sampleRate
    this.channels = Array.from({ length: channels }, () => new Float32Array(length))
  }

  copyFromChannel(): void {}
  copyToChannel(): void {}
  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!
  }
}

function installFakeAudioContext() {
  let instanceCount = 0

  class FakeAudioContext {
    readonly destination = {}
    readonly sampleRate = 48_000
    currentTime = 0
    state: AudioContextState = 'running'

    constructor() {
      instanceCount += 1
    }

    createGain(): FakeGainNode {
      return new FakeGainNode()
    }

    createBufferSource(): FakeBufferSourceNode {
      return new FakeBufferSourceNode()
    }

    createBiquadFilter(): FakeBiquadFilterNode {
      return new FakeBiquadFilterNode()
    }

    createOscillator(): FakeOscillatorNode {
      return new FakeOscillatorNode()
    }

    createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
      return new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer
    }

    resume(): Promise<void> {
      this.state = 'running'
      return Promise.resolve()
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext)

  return {
    getInstanceCount: () => instanceCount,
  }
}

describe('audioSystem', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses default settings when localStorage has no saved audio state', async () => {
    installFakeAudioContext()
    const mod = await import('../audioSystem.js')
    expect(mod.audioSystem.getSettings()).toEqual({
      muted: false,
      musicVolume: 0.55,
      sfxVolume: 0.8,
    })
  })

  it('loads and clamps persisted settings from localStorage', async () => {
    localStorage.setItem(
      'cockpit.audio.settings.v1',
      JSON.stringify({
        muted: true,
        musicVolume: 1.6,
        sfxVolume: -0.5,
      }),
    )
    installFakeAudioContext()
    const mod = await import('../audioSystem.js')
    expect(mod.audioSystem.getSettings()).toEqual({
      muted: true,
      musicVolume: 1,
      sfxVolume: 0,
    })
  })

  it('persists mute/music/sfx changes to localStorage', async () => {
    installFakeAudioContext()
    const mod = await import('../audioSystem.js')

    mod.audioSystem.setMuted(true)
    mod.audioSystem.setMusicVolume(0.33)
    mod.audioSystem.setSfxVolume(0.44)

    const stored = localStorage.getItem(mod.AUDIO_SETTINGS_STORAGE_KEY)
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!)).toEqual({
      muted: true,
      musicVolume: 0.33,
      sfxVolume: 0.44,
    })
  })

  it('creates only one AudioContext instance and reuses it', async () => {
    const ctx = installFakeAudioContext()
    const mod = await import('../audioSystem.js')

    expect(mod.audioSystem.unlockFromUserGesture()).toBe(true)
    expect(mod.audioSystem.unlockFromUserGesture()).toBe(true)

    mod.audioSystem.playAgentSpawn()
    mod.audioSystem.playAgentDespawn()
    mod.audioSystem.playPopupToggle(true)

    expect(ctx.getInstanceCount()).toBe(1)
  })
})
