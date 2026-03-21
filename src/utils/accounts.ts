import type { CodexAccount } from '../types'
import { Color } from '@raycast/api'
import { UNKNOWN_USAGE_TEXT } from '../constants'

export function getAccountSearchKey(account: CodexAccount) {
  return [account.email, account.alias || '', account.plan || '']
    .join(' ')
    .toLowerCase()
}

export function formatUsagePercent(percent?: number) {
  return typeof percent === 'number' ? `${percent}%` : UNKNOWN_USAGE_TEXT
}

export function formatUnixSeconds(unixSeconds?: number) {
  if (!unixSeconds)
    return UNKNOWN_USAGE_TEXT

  return new Date(unixSeconds * 1000).toLocaleString()
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function getRemainingPercent(usedPercent?: number) {
  if (typeof usedPercent !== 'number')
    return undefined

  return Math.max(0, 100 - clampPercent(usedPercent))
}

export function formatRemainingPercent(usedPercent?: number) {
  const remaining = getRemainingPercent(usedPercent)
  return typeof remaining === 'number' ? `${remaining}%` : UNKNOWN_USAGE_TEXT
}

export function getRemainingColor(usedPercent?: number) {
  const remaining = getRemainingPercent(usedPercent)
  if (typeof remaining !== 'number')
    return undefined

  if (remaining <= 15)
    return Color.Red

  if (remaining <= 40)
    return Color.Orange

  return Color.Green
}

export function buildRemainingTag(label: string, usedPercent?: number) {
  const text = `${label} ${formatRemainingPercent(usedPercent)}`
  const color = getRemainingColor(usedPercent)
  return color ? { value: text, color } : text
}

export function toDateFromUnixSeconds(unixSeconds?: number) {
  if (!unixSeconds)
    return undefined

  return new Date(unixSeconds * 1000)
}
