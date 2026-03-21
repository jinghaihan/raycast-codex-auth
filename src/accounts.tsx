import type { CodexAccount } from './types'
import { Action, ActionPanel, Color, Icon, List, open, showToast, Toast } from '@raycast/api'
import { useMemo, useState } from 'react'
import { ACCOUNTS_SEARCH_PLACEHOLDER, NO_ACCOUNTS_DESCRIPTION } from './constants'
import { useRegistryState } from './hooks/use-registry'
import { buildRemainingTag, getAccountSearchKey, toDateFromUnixSeconds } from './utils/accounts'
import { getCodexAuthErrorMessage, switchCodexAccount } from './utils/codex-auth'
import { getRegistryPath } from './utils/registry'

const EMPTY_ACCOUNTS: CodexAccount[] = []

export default function AccountsDashboardCommand() {
  const { data, isLoading, error, reload } = useRegistryState()
  const [searchText, setSearchText] = useState('')

  const accounts = data?.accounts ?? EMPTY_ACCOUNTS
  const activeAccountKey = data?.active_account_key
  const registryPath = getRegistryPath()

  const visibleAccounts = useMemo(() => {
    const normalized = searchText.trim().toLowerCase()
    const filtered = normalized
      ? accounts.filter(account => getAccountSearchKey(account).includes(normalized))
      : accounts

    return [...filtered].sort((left, right) => {
      const leftActive = left.account_key === activeAccountKey
      const rightActive = right.account_key === activeAccountKey
      if (leftActive === rightActive)
        return left.email.localeCompare(right.email)

      return leftActive ? -1 : 1
    })
  }, [accounts, activeAccountKey, searchText])

  async function handleSwitch(account: CodexAccount) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Switching to ${account.email}`,
    })

    try {
      await switchCodexAccount(account.email)
      toast.style = Toast.Style.Success
      toast.title = 'Account switched'
      toast.message = account.email
      await reload()
    }
    catch (error) {
      toast.style = Toast.Style.Failure
      toast.title = 'Switch failed'
      toast.message = getCodexAuthErrorMessage(error)
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={ACCOUNTS_SEARCH_PLACEHOLDER}
      onSearchTextChange={setSearchText}
    >
      {error && (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Failed to read Codex accounts"
          description={error}
          actions={(
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={reload} />
              <Action
                title="Open Registry File"
                icon={Icon.Document}
                onAction={() => open(registryPath)}
              />
            </ActionPanel>
          )}
        />
      )}

      {!error && accounts.length === 0 && (
        <List.EmptyView
          icon={Icon.Person}
          title="No Codex accounts found"
          description={NO_ACCOUNTS_DESCRIPTION}
          actions={(
            <ActionPanel>
              <Action
                title="Open Registry File"
                icon={Icon.Document}
                onAction={() => open(registryPath)}
              />
            </ActionPanel>
          )}
        />
      )}

      {!error && visibleAccounts.map((account) => {
        const isActive = account.account_key === activeAccountKey
        const primaryUsed = account.last_usage?.primary?.used_percent
        const weeklyUsed = account.last_usage?.secondary?.used_percent
        const lastRefreshAt = toDateFromUnixSeconds(account.last_usage_at)
        const accessories: List.Item.Accessory[] = [
          {
            tag: buildRemainingTag('5h', primaryUsed),
            tooltip: 'Remaining quota in 5h window',
          },
          {
            tag: buildRemainingTag('Week', weeklyUsed),
            tooltip: 'Remaining quota in weekly window',
          },
          lastRefreshAt
            ? {
                date: lastRefreshAt,
                icon: Icon.Clock,
                tooltip: `Last Refresh: ${lastRefreshAt.toLocaleString()}`,
              }
            : {
                text: 'refresh n/a',
                icon: Icon.Clock,
                tooltip: 'Last Refresh: n/a',
              },
        ]

        return (
          <List.Item
            key={account.account_key}
            icon={isActive ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Circle}
            title={account.email}
            accessories={accessories}
            actions={(
              <ActionPanel>
                {!isActive && (
                  <Action
                    title="Switch Account"
                    icon={Icon.Repeat}
                    onAction={() => handleSwitch(account)}
                  />
                )}
                <Action
                  title="Refresh Accounts"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ['cmd'], key: 'r' }}
                  onAction={reload}
                />
                <Action.CopyToClipboard title="Copy Email" content={account.email} />
                <Action
                  title="Open Registry File"
                  icon={Icon.Document}
                  onAction={() => open(registryPath)}
                />
              </ActionPanel>
            )}
          />
        )
      })}
    </List>
  )
}
