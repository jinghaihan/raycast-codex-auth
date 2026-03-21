import type { AccountUsage, CodexAccount, CodexRegistry, UsageWindow } from '../types'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CODEX_REGISTRY_RELATIVE_PATH, INVALID_REGISTRY_ERROR_MESSAGE } from '../constants'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toOptionalNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function toUsageWindow(value: unknown): UsageWindow | undefined {
  if (!isRecord(value))
    return undefined

  const usedPercent = toOptionalNumber(value.used_percent)
  const windowMinutes = toOptionalNumber(value.window_minutes)
  const resetsAt = toOptionalNumber(value.resets_at)

  if (usedPercent === undefined || windowMinutes === undefined || resetsAt === undefined)
    return undefined

  return {
    used_percent: usedPercent,
    window_minutes: windowMinutes,
    resets_at: resetsAt,
  }
}

function toAccountUsage(value: unknown): AccountUsage | undefined {
  if (!isRecord(value))
    return undefined

  const primary = toUsageWindow(value.primary)
  const secondary = toUsageWindow(value.secondary)
  const planType = toOptionalString(value.plan_type)

  if (!primary && !secondary && !planType)
    return undefined

  return {
    primary,
    secondary,
    plan_type: planType,
  }
}

function toAccount(value: unknown): CodexAccount | null {
  if (!isRecord(value))
    return null
  if (typeof value.account_key !== 'string' || typeof value.email !== 'string')
    return null

  return {
    account_key: value.account_key,
    email: value.email,
    alias: toOptionalString(value.alias),
    plan: toOptionalString(value.plan),
    auth_mode: toOptionalString(value.auth_mode),
    last_usage: toAccountUsage(value.last_usage),
    last_usage_at: toOptionalNumber(value.last_usage_at),
    last_used_at: toOptionalNumber(value.last_used_at),
  }
}

function toApiSettings(value: unknown) {
  if (!isRecord(value))
    return undefined

  return {
    usage: typeof value.usage === 'boolean' ? value.usage : undefined,
  }
}

function toAutoSwitchSettings(value: unknown) {
  if (!isRecord(value))
    return undefined

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : undefined,
    threshold_5h_percent: toOptionalNumber(value.threshold_5h_percent),
    threshold_weekly_percent: toOptionalNumber(value.threshold_weekly_percent),
  }
}

export function getRegistryPath() {
  return path.join(os.homedir(), CODEX_REGISTRY_RELATIVE_PATH)
}

export async function readRegistry() {
  const content = await readFile(getRegistryPath(), 'utf8')
  const parsed: unknown = JSON.parse(content)

  if (!isRecord(parsed))
    throw new Error(INVALID_REGISTRY_ERROR_MESSAGE)

  const accounts = Array.isArray(parsed.accounts)
    ? parsed.accounts
        .map(toAccount)
        .filter((account): account is CodexAccount => account !== null)
    : []

  return {
    schema_version: toOptionalNumber(parsed.schema_version) ?? 0,
    active_account_key: toOptionalString(parsed.active_account_key),
    active_account_activated_at_ms: toOptionalNumber(parsed.active_account_activated_at_ms),
    accounts,
    api: toApiSettings(parsed.api),
    auto_switch: toAutoSwitchSettings(parsed.auto_switch),
  } satisfies CodexRegistry
}
