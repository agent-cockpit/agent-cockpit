import { useSyncExternalStore } from 'react'

export interface AudioSettings {
  muted: boolean
  musicVolume: number
  sfxVolume: number
}

export const AUDIO_SETTINGS_STORAGE_KEY = 'cockpit.audio.settings.v1'

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  musicVolume: 0.55,
  sfxVolume: 0.8,
}

const AMBIENT_TRACK_PATH = '/audio/office-lofi.ogg'
const FOOTSTEP_COOLDOWN_MS = 280

interface ToneOptions {
  type: OscillatorType
  fromHz: number
  toHz?: number
  durationMs: number
  attackMs: number
  amplitude: number
}

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function readStoredSettings(): AudioSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_AUDIO_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_AUDIO_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AudioSettings>
    return {
      muted: Boolean(parsed.muted),
      musicVolume: clamp01(parsed.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
      sfxVolume: clamp01(parsed.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
    }
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

class AudioSystem {
  private readonly listeners = new Set<() => void>()
  private settings: AudioSettings = readStoredSettings()
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private ambientSource: AudioBufferSourceNode | null = null
  private ambientBufferPromise: Promise<AudioBuffer> | null = null
  private unlocked = false
  private lastFootstepAt = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSettings(): AudioSettings {
    return this.settings
  }

  setMuted(next: boolean): void {
    if (this.settings.muted === next) return
    this.settings = { ...this.settings, muted: next }
    this.persistSettings()
    this.applyGainLevels()
    this.emitChange()
  }

  setMusicVolume(next: number): void {
    const clamped = clamp01(next)
    if (this.settings.musicVolume === clamped) return
    this.settings = { ...this.settings, musicVolume: clamped }
    this.persistSettings()
    this.applyGainLevels()
    this.emitChange()
  }

  setSfxVolume(next: number): void {
    const clamped = clamp01(next)
    if (this.settings.sfxVolume === clamped) return
    this.settings = { ...this.settings, sfxVolume: clamped }
    this.persistSettings()
    this.applyGainLevels()
    this.emitChange()
  }

  unlockFromUserGesture(): boolean {
    const context = this.ensureAudioContext()
    if (!context) return false

    this.unlocked = true
    if (context.state === 'suspended') {
      void context.resume().catch(() => {})
    }
    this.ensureAmbientLoop()
    return true
  }

  playFootstep(): void {
    if (!this.unlocked) return
    const now = performance.now()
    if (now - this.lastFootstepAt < FOOTSTEP_COOLDOWN_MS) return
    this.lastFootstepAt = now

    this.playTone({
      type: 'triangle',
      fromHz: 170,
      toHz: 110,
      durationMs: 90,
      attackMs: 4,
      amplitude: 0.21,
    })
  }

  playApprovalResolved(decision: 'approved' | 'denied' | 'always_allow' | 'timeout'): void {
    if (!this.unlocked) return

    if (decision === 'approved' || decision === 'always_allow') {
      this.playTone({
        type: 'sine',
        fromHz: 420,
        toHz: 650,
        durationMs: 140,
        attackMs: 5,
        amplitude: 0.2,
      })
      return
    }

    this.playTone({
      type: 'sawtooth',
      fromHz: 300,
      toHz: 140,
      durationMs: 180,
      attackMs: 4,
      amplitude: 0.22,
    })
  }

  playAgentSpawn(): void {
    if (!this.unlocked) return
    this.playTone({
      type: 'square',
      fromHz: 250,
      toHz: 430,
      durationMs: 120,
      attackMs: 4,
      amplitude: 0.16,
    })
  }

  playAgentDespawn(): void {
    if (!this.unlocked) return
    this.playTone({
      type: 'triangle',
      fromHz: 220,
      toHz: 120,
      durationMs: 150,
      attackMs: 4,
      amplitude: 0.15,
    })
  }

  playPopupToggle(open: boolean): void {
    if (!this.unlocked) return
    this.playTone({
      type: 'sine',
      fromHz: open ? 680 : 360,
      toHz: open ? 900 : 240,
      durationMs: 80,
      attackMs: 3,
      amplitude: 0.15,
    })
  }

  private emitChange(): void {
    this.listeners.forEach((listener) => listener())
  }

  private persistSettings(): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings))
    } catch {
      // Ignore quota/security errors and keep in-memory settings.
    }
  }

  private getAudioContextCtor(): typeof AudioContext | undefined {
    if (typeof window === 'undefined') return undefined
    const castedWindow = window as AudioContextWindow
    return window.AudioContext ?? castedWindow.webkitAudioContext
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext
    const AudioContextCtor = this.getAudioContextCtor()
    if (!AudioContextCtor) return null

    const context = new AudioContextCtor()
    const master = context.createGain()
    const music = context.createGain()
    const sfx = context.createGain()

    music.connect(master)
    sfx.connect(master)
    master.connect(context.destination)

    this.audioContext = context
    this.masterGain = master
    this.musicGain = music
    this.sfxGain = sfx

    this.applyGainLevels()
    return context
  }

  private applyGainLevels(): void {
    if (!this.audioContext || !this.masterGain || !this.musicGain || !this.sfxGain) return
    const now = this.audioContext.currentTime
    this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : 1, now, 0.015)
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume, now, 0.015)
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.015)
  }

  private ensureAmbientLoop(): void {
    if (this.ambientSource) return
    const context = this.ensureAudioContext()
    if (!context || !this.musicGain) return

    void this.getAmbientBuffer(context).then((buffer) => {
      if (this.ambientSource || !this.musicGain) return

      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true

      const lowpass = context.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.setValueAtTime(4200, context.currentTime)
      lowpass.Q.setValueAtTime(0.35, context.currentTime)

      source.connect(lowpass)
      lowpass.connect(this.musicGain)
      source.start(context.currentTime)

      this.ambientSource = source
      source.onended = () => {
        if (this.ambientSource === source) {
          this.ambientSource = null
        }
      }
    })
  }

  private getAmbientBuffer(context: AudioContext): Promise<AudioBuffer> {
    if (this.ambientBufferPromise) return this.ambientBufferPromise

    this.ambientBufferPromise = this.loadAmbientFile(context)
      .catch(() => this.buildAmbientBuffer(context))
    return this.ambientBufferPromise
  }

  private async loadAmbientFile(context: AudioContext): Promise<AudioBuffer> {
    const response = await fetch(AMBIENT_TRACK_PATH, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Failed to fetch ambient track: ${response.status}`)
    }
    const bytes = await response.arrayBuffer()
    return context.decodeAudioData(bytes.slice(0))
  }

  private buildAmbientBuffer(context: AudioContext): AudioBuffer {
    const durationSec = 8
    const frameCount = Math.floor(context.sampleRate * durationSec)
    const buffer = context.createBuffer(1, frameCount, context.sampleRate)
    const channel = buffer.getChannelData(0)

    for (let i = 0; i < frameCount; i++) {
      const t = i / context.sampleRate
      // Relaxed, brighter pad: major-ish stacked harmonics with slow swell.
      // Frequencies are chosen as multiples of 1/8s so the 8s loop is seamless.
      const root = Math.sin(2 * Math.PI * 192 * t) * 0.28
      const third = Math.sin(2 * Math.PI * 240 * t + 0.35) * 0.2
      const fifth = Math.sin(2 * Math.PI * 288 * t + 0.8) * 0.15
      const swell = 0.78 + 0.22 * Math.sin(2 * Math.PI * 0.125 * t)
      const air = Math.sin(2 * Math.PI * 384 * t + 0.2) * (0.015 + 0.01 * Math.sin(2 * Math.PI * 0.25 * t))
      channel[i] = ((root + third + fifth) * swell + air) * 0.34
    }

    return buffer
  }

  private playTone(options: ToneOptions): void {
    const context = this.ensureAudioContext()
    if (!context || !this.sfxGain) return

    const now = context.currentTime
    const durationSec = options.durationMs / 1000
    const attackSec = Math.min(durationSec * 0.5, options.attackMs / 1000)
    const fromHz = Math.max(1, options.fromHz)
    const toHz = Math.max(1, options.toHz ?? options.fromHz)
    const safeAmp = Math.max(0.0001, options.amplitude)

    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = options.type
    oscillator.frequency.setValueAtTime(fromHz, now)
    oscillator.frequency.exponentialRampToValueAtTime(toHz, now + durationSec)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(safeAmp, now + attackSec)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

    oscillator.connect(gain)
    gain.connect(this.sfxGain)
    oscillator.start(now)
    oscillator.stop(now + durationSec + 0.02)
  }
}

export const audioSystem = new AudioSystem()

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    (listener) => audioSystem.subscribe(listener),
    () => audioSystem.getSettings(),
    () => audioSystem.getSettings(),
  )
}
