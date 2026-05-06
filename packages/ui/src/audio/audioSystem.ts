import { useSyncExternalStore } from 'react'
import type { CharacterType } from '../components/office/characterMapping.js'

export interface AudioSettings {
  muted: boolean
  musicVolume: number
  sfxVolume: number
}

export const AUDIO_SETTINGS_STORAGE_KEY = 'cockpit.audio.settings.v1'

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  musicVolume: 0.55,
  sfxVolume: 0.2,
}

const MUSIC_CROSSFADE_SEC = 8
const MIN_CROSSFADE_SEC = 0.4
const MIN_NEXT_TRACK_DELAY_SEC = 0.6
const DEFAULT_WALK_COOLDOWN_MS = 280
const DEFAULT_RUN_COOLDOWN_MS = 170
const FOOTSTEP_SAMPLE_BASE_GAIN = 0.52
const RUN_SAMPLE_GAIN_MULTIPLIER = 1.35
const IS_TEST_ENV = import.meta.env?.MODE === 'test'

type MovementMode = 'walk' | 'run'

interface FootstepOptions {
  character: CharacterType
  movement: MovementMode
  actorId?: string
}

type FootstepSurface = 'carpet' | 'concrete' | 'grass' | 'snow' | 'wood'

interface FootstepProfile {
  walkSurface: FootstepSurface
  runSurface: FootstepSurface
  walkRateMin: number
  walkRateMax: number
  runRateMin: number
  runRateMax: number
  sampleGain: number
  fallbackType: OscillatorType
  fallbackWalkFromHz: number
  fallbackWalkToHz: number
  fallbackRunFromHz: number
  fallbackRunToHz: number
  fallbackAmplitude: number
  walkCooldownMs?: number
  runCooldownMs?: number
}

type ProceduralTrackPalette = 'nebula' | 'archive' | 'night-shift' | 'sunrise'

interface MusicTrackSpec {
  id: string
  kind: 'file' | 'procedural'
  path?: string
  palette?: ProceduralTrackPalette
  durationSec?: number
}

interface LoadedTrack {
  id: string
  buffer: AudioBuffer
  durationSec: number
}

interface ActiveMusicNode {
  id: string
  source: AudioBufferSourceNode
  gain: GainNode
}

const MUSIC_TRACKS: ReadonlyArray<MusicTrackSpec> = [
  { id: 'office-lofi', kind: 'file', path: '/audio/office-lofi.ogg' },
  { id: 'pressure', kind: 'file', path: '/audio/music/pressure.ogg' },
  { id: 'oriented', kind: 'file', path: '/audio/music/oriented.ogg' },
  { id: 'nighttime-solitude', kind: 'file', path: '/audio/music/nighttime-solitude.ogg' },
] as const

const PROCEDURAL_TRACK_PALETTES: ReadonlyArray<ProceduralTrackPalette> = [
  'nebula',
  'archive',
  'night-shift',
  'sunrise',
] as const

const FOOTSTEP_SAMPLES: Record<FootstepSurface, readonly string[]> = {
  carpet: [
    '/audio/sfx/footsteps/footstep_carpet_000.ogg',
    '/audio/sfx/footsteps/footstep_carpet_001.ogg',
    '/audio/sfx/footsteps/footstep_carpet_002.ogg',
    '/audio/sfx/footsteps/footstep_carpet_003.ogg',
    '/audio/sfx/footsteps/footstep_carpet_004.ogg',
  ],
  concrete: [
    '/audio/sfx/footsteps/footstep_concrete_000.ogg',
    '/audio/sfx/footsteps/footstep_concrete_001.ogg',
    '/audio/sfx/footsteps/footstep_concrete_002.ogg',
    '/audio/sfx/footsteps/footstep_concrete_003.ogg',
    '/audio/sfx/footsteps/footstep_concrete_004.ogg',
  ],
  grass: [
    '/audio/sfx/footsteps/footstep_grass_000.ogg',
    '/audio/sfx/footsteps/footstep_grass_001.ogg',
    '/audio/sfx/footsteps/footstep_grass_002.ogg',
    '/audio/sfx/footsteps/footstep_grass_003.ogg',
    '/audio/sfx/footsteps/footstep_grass_004.ogg',
  ],
  snow: [
    '/audio/sfx/footsteps/footstep_snow_000.ogg',
    '/audio/sfx/footsteps/footstep_snow_001.ogg',
    '/audio/sfx/footsteps/footstep_snow_002.ogg',
    '/audio/sfx/footsteps/footstep_snow_003.ogg',
    '/audio/sfx/footsteps/footstep_snow_004.ogg',
  ],
  wood: [
    '/audio/sfx/footsteps/footstep_wood_000.ogg',
    '/audio/sfx/footsteps/footstep_wood_001.ogg',
    '/audio/sfx/footsteps/footstep_wood_002.ogg',
    '/audio/sfx/footsteps/footstep_wood_003.ogg',
    '/audio/sfx/footsteps/footstep_wood_004.ogg',
  ],
} as const

const SURFACE_GAIN_MULTIPLIERS: Record<FootstepSurface, number> = {
  carpet: 1.22,
  concrete: 1,
  grass: 1.08,
  snow: 1.12,
  wood: 1.03,
}

const FOOTSTEP_PROFILES: Record<CharacterType, FootstepProfile> = {
  astronaut: {
    walkSurface: 'concrete',
    runSurface: 'concrete',
    walkRateMin: 0.96,
    walkRateMax: 1.02,
    runRateMin: 1.08,
    runRateMax: 1.16,
    sampleGain: 1,
    fallbackType: 'triangle',
    fallbackWalkFromHz: 178,
    fallbackWalkToHz: 116,
    fallbackRunFromHz: 212,
    fallbackRunToHz: 132,
    fallbackAmplitude: 0.18,
  },
  robot: {
    walkSurface: 'concrete',
    runSurface: 'concrete',
    walkRateMin: 0.9,
    walkRateMax: 0.98,
    runRateMin: 1.02,
    runRateMax: 1.1,
    sampleGain: 1.05,
    fallbackType: 'square',
    fallbackWalkFromHz: 132,
    fallbackWalkToHz: 96,
    fallbackRunFromHz: 164,
    fallbackRunToHz: 110,
    fallbackAmplitude: 0.2,
    walkCooldownMs: 295,
    runCooldownMs: 180,
  },
  alien: {
    walkSurface: 'concrete',
    runSurface: 'concrete',
    walkRateMin: 1,
    walkRateMax: 1.06,
    runRateMin: 1.12,
    runRateMax: 1.2,
    sampleGain: 0.95,
    fallbackType: 'sawtooth',
    fallbackWalkFromHz: 224,
    fallbackWalkToHz: 146,
    fallbackRunFromHz: 272,
    fallbackRunToHz: 172,
    fallbackAmplitude: 0.17,
  },
  hologram: {
    walkSurface: 'carpet',
    runSurface: 'carpet',
    walkRateMin: 1.04,
    walkRateMax: 1.1,
    runRateMin: 1.14,
    runRateMax: 1.24,
    sampleGain: 0.8,
    fallbackType: 'sine',
    fallbackWalkFromHz: 262,
    fallbackWalkToHz: 198,
    fallbackRunFromHz: 320,
    fallbackRunToHz: 240,
    fallbackAmplitude: 0.14,
    walkCooldownMs: 260,
    runCooldownMs: 158,
  },
  monkey: {
    walkSurface: 'concrete',
    runSurface: 'wood',
    walkRateMin: 0.98,
    walkRateMax: 1.06,
    runRateMin: 1.1,
    runRateMax: 1.2,
    sampleGain: 0.93,
    fallbackType: 'triangle',
    fallbackWalkFromHz: 192,
    fallbackWalkToHz: 130,
    fallbackRunFromHz: 236,
    fallbackRunToHz: 158,
    fallbackAmplitude: 0.19,
  },
  caveman: {
    walkSurface: 'wood',
    runSurface: 'wood',
    walkRateMin: 0.88,
    walkRateMax: 0.96,
    runRateMin: 1,
    runRateMax: 1.1,
    sampleGain: 1.08,
    fallbackType: 'square',
    fallbackWalkFromHz: 122,
    fallbackWalkToHz: 86,
    fallbackRunFromHz: 148,
    fallbackRunToHz: 102,
    fallbackAmplitude: 0.24,
    walkCooldownMs: 310,
    runCooldownMs: 190,
  },
  ghost: {
    walkSurface: 'carpet',
    runSurface: 'carpet',
    walkRateMin: 0.92,
    walkRateMax: 1,
    runRateMin: 1.04,
    runRateMax: 1.14,
    sampleGain: 0.75,
    fallbackType: 'sine',
    fallbackWalkFromHz: 146,
    fallbackWalkToHz: 104,
    fallbackRunFromHz: 176,
    fallbackRunToHz: 118,
    fallbackAmplitude: 0.12,
    walkCooldownMs: 250,
    runCooldownMs: 155,
  },
  ninja: {
    walkSurface: 'carpet',
    runSurface: 'concrete',
    walkRateMin: 1.03,
    walkRateMax: 1.1,
    runRateMin: 1.16,
    runRateMax: 1.28,
    sampleGain: 0.82,
    fallbackType: 'triangle',
    fallbackWalkFromHz: 244,
    fallbackWalkToHz: 172,
    fallbackRunFromHz: 292,
    fallbackRunToHz: 204,
    fallbackAmplitude: 0.16,
    walkCooldownMs: 235,
    runCooldownMs: 145,
  },
  pirate: {
    walkSurface: 'wood',
    runSurface: 'wood',
    walkRateMin: 0.93,
    walkRateMax: 1,
    runRateMin: 1.06,
    runRateMax: 1.15,
    sampleGain: 1,
    fallbackType: 'sawtooth',
    fallbackWalkFromHz: 168,
    fallbackWalkToHz: 118,
    fallbackRunFromHz: 204,
    fallbackRunToHz: 140,
    fallbackAmplitude: 0.2,
  },
  'medicine-woman': {
    walkSurface: 'concrete',
    runSurface: 'concrete',
    walkRateMin: 0.97,
    walkRateMax: 1.04,
    runRateMin: 1.1,
    runRateMax: 1.18,
    sampleGain: 0.92,
    fallbackType: 'sine',
    fallbackWalkFromHz: 186,
    fallbackWalkToHz: 126,
    fallbackRunFromHz: 228,
    fallbackRunToHz: 154,
    fallbackAmplitude: 0.18,
  },
}

const DEFAULT_FOOTSTEP_PROFILE = FOOTSTEP_PROFILES.astronaut

interface ToneOptions {
  type: OscillatorType
  fromHz: number
  toHz?: number
  durationMs: number
  attackMs: number
  amplitude: number
  startDelayMs?: number
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
  private readonly trackLoadPromises = new Map<string, Promise<LoadedTrack>>()
  private readonly footstepBufferPromises = new Map<string, Promise<AudioBuffer>>()
  private activeMusicNode: ActiveMusicNode | null = null
  private scheduledTrackTimer: number | null = null
  private musicTransitionInFlight = false
  private playlistBag: MusicTrackSpec[] = []
  private lastTrackId: string | null = null
  private unlocked = false
  private readonly lastFootstepAtByActor = new Map<string, number>()

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
    this.preloadFootsteps()
    this.ensureMusicPlaylist()
    return true
  }

  playFootstep(options: FootstepOptions): void {
    if (!this.unlocked) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const actorId = options.actorId ?? 'global'
    const profile = FOOTSTEP_PROFILES[options.character] ?? DEFAULT_FOOTSTEP_PROFILE
    const movement = options.movement
    const cooldownMs = movement === 'run'
      ? profile.runCooldownMs ?? DEFAULT_RUN_COOLDOWN_MS
      : profile.walkCooldownMs ?? DEFAULT_WALK_COOLDOWN_MS
    const lastAt = this.lastFootstepAtByActor.get(actorId) ?? 0
    if (now - lastAt < cooldownMs) return
    this.lastFootstepAtByActor.set(actorId, now)

    void this.playFootstepSample(profile, movement).catch(() => {
      const fromHz = movement === 'run' ? profile.fallbackRunFromHz : profile.fallbackWalkFromHz
      const toHz = movement === 'run' ? profile.fallbackRunToHz : profile.fallbackWalkToHz
      this.playTone({
        type: profile.fallbackType,
        fromHz,
        toHz,
        durationMs: movement === 'run' ? 78 : 98,
        attackMs: movement === 'run' ? 2 : 4,
        amplitude: profile.fallbackAmplitude * (movement === 'run' ? 1.15 : 1),
      })
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

  private preloadFootsteps(): void {
    const context = this.ensureAudioContext()
    if (!context) return
    for (const pathList of Object.values(FOOTSTEP_SAMPLES)) {
      for (const path of pathList) {
        void this.getFootstepBuffer(context, path).catch(() => {})
      }
    }
  }

  private async playFootstepSample(profile: FootstepProfile, movement: MovementMode): Promise<void> {
    const context = this.ensureAudioContext()
    if (!context || !this.sfxGain) {
      throw new Error('Audio context unavailable for footstep playback')
    }

    const surface = movement === 'run' ? profile.runSurface : profile.walkSurface
    const samplePath = this.randomFrom(FOOTSTEP_SAMPLES[surface])
    const buffer = await this.getFootstepBuffer(context, samplePath)
    if (!this.sfxGain) {
      throw new Error('SFX gain unavailable for footstep playback')
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.setValueAtTime(
      movement === 'run'
        ? this.randomBetween(profile.runRateMin, profile.runRateMax)
        : this.randomBetween(profile.walkRateMin, profile.walkRateMax),
      context.currentTime,
    )

    const gain = context.createGain()
    const surfaceGain = SURFACE_GAIN_MULTIPLIERS[surface] ?? 1
    const amplitude = FOOTSTEP_SAMPLE_BASE_GAIN *
      profile.sampleGain *
      surfaceGain *
      (movement === 'run' ? RUN_SAMPLE_GAIN_MULTIPLIER : 1)
    gain.gain.setValueAtTime(Math.max(0.0001, Math.min(0.95, amplitude)), context.currentTime)

    source.connect(gain)
    gain.connect(this.sfxGain)
    source.start(context.currentTime)

    if (movement === 'run') {
      // Add a subtle low transient so sprinting feels heavier and is perceived as louder.
      this.playTone({
        type: 'triangle',
        fromHz: 122,
        toHz: 94,
        durationMs: 56,
        attackMs: 2,
        amplitude: 0.028,
        startDelayMs: 3,
      })
    }
  }

  private getFootstepBuffer(context: AudioContext, path: string): Promise<AudioBuffer> {
    const cached = this.footstepBufferPromises.get(path)
    if (cached) return cached

    const loadPromise = this.loadFootstepFile(context, path)
    this.footstepBufferPromises.set(path, loadPromise)
    return loadPromise
  }

  private async loadFootstepFile(context: AudioContext, path: string): Promise<AudioBuffer> {
    const response = await fetch(path, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Failed to fetch footstep sample ${path}: ${response.status}`)
    }

    const bytes = await response.arrayBuffer()
    if (typeof context.decodeAudioData !== 'function') {
      throw new Error('AudioContext decodeAudioData is unavailable')
    }

    return context.decodeAudioData(bytes.slice(0))
  }

  private ensureMusicPlaylist(): void {
    if (this.activeMusicNode || this.musicTransitionInFlight) return
    void this.transitionToNextTrack(true)
  }

  private async transitionToNextTrack(initialTrack: boolean): Promise<void> {
    if (this.musicTransitionInFlight) return
    const context = this.ensureAudioContext()
    if (!context || !this.musicGain) return

    this.musicTransitionInFlight = true

    try {
      const nextTrack = await this.loadRandomTrack(context)
      if (!this.musicGain) return

      const now = context.currentTime
      const fadeSec = this.resolveCrossfadeSec(nextTrack.durationSec, initialTrack)

      const source = context.createBufferSource()
      source.buffer = nextTrack.buffer
      source.loop = false

      const colorFilter = context.createBiquadFilter()
      colorFilter.type = 'lowpass'
      colorFilter.frequency.setValueAtTime(3400 + Math.random() * 1600, now)
      colorFilter.Q.setValueAtTime(0.25, now)

      const trackGain = context.createGain()
      trackGain.gain.setValueAtTime(0.0001, now)
      trackGain.gain.exponentialRampToValueAtTime(1, now + fadeSec)

      source.connect(colorFilter)
      colorFilter.connect(trackGain)
      trackGain.connect(this.musicGain)
      source.start(now)

      const previous = this.activeMusicNode
      this.activeMusicNode = {
        id: nextTrack.id,
        source,
        gain: trackGain,
      }

      source.onended = () => {
        if (this.activeMusicNode?.source === source) {
          this.activeMusicNode = null
        }
      }

      if (previous) {
        this.fadeOutMusicNode(previous, now, fadeSec)
      }

      const nextDelaySec = Math.max(MIN_NEXT_TRACK_DELAY_SEC, nextTrack.durationSec - fadeSec)
      this.scheduleNextTrack(nextDelaySec)
    } catch {
      if (!initialTrack) {
        this.scheduleNextTrack(4)
      }
    } finally {
      this.musicTransitionInFlight = false
    }
  }

  private resolveCrossfadeSec(trackDurationSec: number, initialTrack: boolean): number {
    if (initialTrack) return 1.25
    const safeDuration = Math.max(2, trackDurationSec)
    return Math.max(
      MIN_CROSSFADE_SEC,
      Math.min(MUSIC_CROSSFADE_SEC, safeDuration - MIN_NEXT_TRACK_DELAY_SEC),
    )
  }

  private scheduleNextTrack(delaySec: number): void {
    if (IS_TEST_ENV || typeof window === 'undefined') return
    if (this.scheduledTrackTimer !== null) {
      window.clearTimeout(this.scheduledTrackTimer)
    }

    this.scheduledTrackTimer = window.setTimeout(() => {
      this.scheduledTrackTimer = null
      if (!this.unlocked) return
      void this.transitionToNextTrack(false)
    }, Math.max(0, Math.round(delaySec * 1000)))
  }

  private fadeOutMusicNode(node: ActiveMusicNode, fromSec: number, fadeSec: number): void {
    const rampSec = Math.max(MIN_CROSSFADE_SEC, fadeSec)
    const currentGain = Math.max(0.0001, node.gain.gain.value || 1)
    node.gain.gain.setValueAtTime(currentGain, fromSec)
    node.gain.gain.exponentialRampToValueAtTime(0.0001, fromSec + rampSec)

    try {
      node.source.stop(fromSec + rampSec + 0.06)
    } catch {
      // The source might already be ended or scheduled to stop.
    }
  }

  private async loadRandomTrack(context: AudioContext): Promise<LoadedTrack> {
    const randomPrimary = this.drawTrackFromBag()
    try {
      return await this.loadTrack(context, randomPrimary)
    } catch {
      const fallbackPalettes = this.shuffle([...PROCEDURAL_TRACK_PALETTES])
      for (const palette of fallbackPalettes) {
        try {
          return await this.loadTrack(context, {
            id: `procedural-fallback-${palette}`,
            kind: 'procedural',
            palette,
            durationSec: 30,
          })
        } catch {
          // Try the next fallback palette.
        }
      }
    }

    return this.loadTrack(context, {
      id: 'procedural-emergency',
      kind: 'procedural',
      palette: 'archive',
      durationSec: 26,
    })
  }

  private drawTrackFromBag(): MusicTrackSpec {
    if (this.playlistBag.length === 0) {
      const shuffled = this.shuffle([...MUSIC_TRACKS])
      if (this.lastTrackId && shuffled.length > 1 && shuffled[0]?.id === this.lastTrackId) {
        const last = shuffled.pop()
        if (last) shuffled.unshift(last)
      }
      this.playlistBag = shuffled
    }

    const next = this.playlistBag.shift() ?? MUSIC_TRACKS[0]!
    this.lastTrackId = next.id
    return next
  }

  private shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j]!, list[i]!]
    }
    return list
  }

  private randomFrom<T>(list: readonly T[]): T {
    return list[Math.floor(Math.random() * list.length)]!
  }

  private randomBetween(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 1
    if (max <= min) return min
    return min + Math.random() * (max - min)
  }

  private loadTrack(context: AudioContext, spec: MusicTrackSpec): Promise<LoadedTrack> {
    const cacheKey = this.trackCacheKey(spec)
    const cached = this.trackLoadPromises.get(cacheKey)
    if (cached) return cached

    const loadPromise = spec.kind === 'file'
      ? this.loadFileTrack(context, spec)
      : this.loadProceduralTrack(context, spec)

    this.trackLoadPromises.set(cacheKey, loadPromise)
    return loadPromise
  }

  private trackCacheKey(spec: MusicTrackSpec): string {
    if (spec.kind === 'file') return `file:${spec.path ?? spec.id}`
    return `procedural:${spec.palette ?? 'archive'}:${spec.durationSec ?? 30}`
  }

  private async loadFileTrack(context: AudioContext, spec: MusicTrackSpec): Promise<LoadedTrack> {
    const path = spec.path
    if (!path) throw new Error(`Missing file path for track ${spec.id}`)

    const response = await fetch(path, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Failed to fetch track ${path}: ${response.status}`)
    }

    const bytes = await response.arrayBuffer()
    if (typeof context.decodeAudioData !== 'function') {
      throw new Error('AudioContext decodeAudioData is unavailable')
    }

    const buffer = await context.decodeAudioData(bytes.slice(0))
    const durationSec = Number.isFinite(buffer.duration) && buffer.duration > 0
      ? buffer.duration
      : 24

    return { id: spec.id, buffer, durationSec }
  }

  private async loadProceduralTrack(context: AudioContext, spec: MusicTrackSpec): Promise<LoadedTrack> {
    const palette = spec.palette ?? 'archive'
    const durationSec = Math.max(22, spec.durationSec ?? 30)
    const buffer = this.buildProceduralTrackBuffer(context, palette, durationSec)
    return { id: spec.id, buffer, durationSec }
  }

  private buildProceduralTrackBuffer(
    context: AudioContext,
    palette: ProceduralTrackPalette,
    durationSec: number,
  ): AudioBuffer {
    const profile = this.getPaletteProfile(palette)
    const sampleRate = context.sampleRate
    const frameCount = Math.floor(sampleRate * durationSec)
    const buffer = context.createBuffer(2, frameCount, sampleRate)

    for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
      const channel = buffer.getChannelData(channelIndex)
      const panOffset = channelIndex === 0 ? -0.18 : 0.18
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate
        const root = Math.sin(2 * Math.PI * profile.rootHz * t + panOffset) * 0.22
        const chordB = Math.sin(2 * Math.PI * profile.thirdHz * t + 0.3 + panOffset) * 0.16
        const chordC = Math.sin(2 * Math.PI * profile.fifthHz * t + 0.6 + panOffset) * 0.13
        const shimmer = Math.sin(2 * Math.PI * profile.shimmerHz * t + Math.sin(2 * Math.PI * 0.08 * t)) * 0.04
        const pulse = Math.sin(2 * Math.PI * profile.pulseHz * t + panOffset * 2) * 0.06
        const swell = 0.7 + 0.3 * Math.sin(2 * Math.PI * profile.swellHz * t)
        const grain = (Math.random() * 2 - 1) * profile.noiseLevel
        channel[i] = ((root + chordB + chordC + shimmer + pulse) * swell + grain) * profile.masterGain
      }
    }

    return buffer
  }

  private getPaletteProfile(palette: ProceduralTrackPalette): {
    rootHz: number
    thirdHz: number
    fifthHz: number
    shimmerHz: number
    pulseHz: number
    swellHz: number
    noiseLevel: number
    masterGain: number
  } {
    switch (palette) {
      case 'nebula':
        return {
          rootHz: 168,
          thirdHz: 212,
          fifthHz: 252,
          shimmerHz: 348,
          pulseHz: 0.22,
          swellHz: 0.11,
          noiseLevel: 0.006,
          masterGain: 0.31,
        }
      case 'night-shift':
        return {
          rootHz: 148,
          thirdHz: 185,
          fifthHz: 220,
          shimmerHz: 302,
          pulseHz: 0.18,
          swellHz: 0.085,
          noiseLevel: 0.008,
          masterGain: 0.34,
        }
      case 'sunrise':
        return {
          rootHz: 188,
          thirdHz: 236,
          fifthHz: 280,
          shimmerHz: 406,
          pulseHz: 0.3,
          swellHz: 0.13,
          noiseLevel: 0.005,
          masterGain: 0.29,
        }
      case 'archive':
      default:
        return {
          rootHz: 156,
          thirdHz: 196,
          fifthHz: 232,
          shimmerHz: 336,
          pulseHz: 0.2,
          swellHz: 0.095,
          noiseLevel: 0.007,
          masterGain: 0.33,
        }
    }
  }

  private playTone(options: ToneOptions): void {
    const context = this.ensureAudioContext()
    if (!context || !this.sfxGain) return

    const now = context.currentTime + (options.startDelayMs ?? 0) / 1000
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
