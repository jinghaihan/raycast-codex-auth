export interface UsageWindow {
  used_percent: number
  window_minutes: number
  resets_at: number
}

export interface AccountUsage {
  primary?: UsageWindow
  secondary?: UsageWindow
  plan_type?: string
}

export interface CodexAccount {
  account_key: string
  email: string
  alias?: string
  plan?: string
  auth_mode?: string
  last_usage?: AccountUsage
  last_usage_at?: number
  last_used_at?: number
}

export interface CodexRegistry {
  schema_version: number
  active_account_key?: string
  active_account_activated_at_ms?: number
  accounts: CodexAccount[]
  api?: {
    usage?: boolean
  }
  auto_switch?: {
    enabled?: boolean
    threshold_5h_percent?: number
    threshold_weekly_percent?: number
  }
}

export interface CodexAuthCommandResult {
  stdout: string
  stderr: string
}

export interface CodexAuthCommandFailure {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
}
