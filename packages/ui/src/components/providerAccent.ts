import type { CSSProperties } from 'react'
import type { SessionRecord } from '../store/index.js'

type Provider = SessionRecord['provider']

const PROVIDER_ACCENT_VAR: Record<Provider, string> = {
  claude: 'var(--color-provider-claude)',
  codex: 'var(--color-provider-codex)',
}

export function getProviderAccentStyle(provider: Provider): CSSProperties {
  return {
    '--color-cockpit-accent': PROVIDER_ACCENT_VAR[provider],
  } as CSSProperties
}
