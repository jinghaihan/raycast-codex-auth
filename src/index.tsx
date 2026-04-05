import type { ReactElement } from 'react'
import type { Account } from './codex-auth'
import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from '@raycast/api'
import { useEffect, useState } from 'react'
import { listAccounts, switchAccount } from './codex-auth'

export default function Command(): ReactElement {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [switchingAccountId, setSwitchingAccountId] = useState<string>()

  useEffect(() => {
    let isCancelled = false

    async function load(): Promise<void> {
      setIsLoading(true)

      try {
        const nextAccounts = await listAccounts()

        if (isCancelled)
          return

        setAccounts(nextAccounts)
        setErrorMessage(undefined)
      }
      catch (error) {
        if (isCancelled)
          return

        const message = getErrorMessage(error)
        setAccounts([])
        setErrorMessage(message)

        if (reloadToken > 0) {
          void showToast({
            style: Toast.Style.Failure,
            title: 'Could not reload accounts',
            message,
          })
        }
      }
      finally {
        if (!isCancelled)
          setIsLoading(false)
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [reloadToken])

  async function handleSwitchAccount(account: Account): Promise<void> {
    setSwitchingAccountId(account.id)

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Switching to ${getAccountTitle(account)}`,
      message: account.label ? account.email : undefined,
    })

    try {
      await switchAccount(account)

      toast.style = Toast.Style.Success
      toast.title = `Switched to ${getAccountTitle(account)}`
      toast.message = account.label ? account.email : undefined

      setReloadToken(token => token + 1)
    }
    catch (error) {
      toast.style = Toast.Style.Failure
      toast.title = 'Failed to switch account'
      toast.message = getErrorMessage(error)
    }
    finally {
      setSwitchingAccountId(undefined)
    }
  }

  function reloadAccounts(): void {
    setReloadToken(token => token + 1)
  }

  const activeAccounts = accounts.filter(account => account.isActive)
  const otherAccounts = accounts.filter(account => !account.isActive)
  let content: ReactElement

  if (accounts.length === 0) {
    content = (
      <List.EmptyView
        icon={errorMessage ? { source: Icon.XMarkCircle, tintColor: Color.Red } : Icon.PersonCircle}
        title={errorMessage ? 'Could not load Codex accounts' : 'No Codex accounts found'}
        description={errorMessage || 'Sign in with codex-auth first, then reload this list.'}
        actions={
          (
            <ActionPanel>
              <Action
                title="Reload Accounts"
                icon={Icon.Repeat}
                onAction={reloadAccounts}
              />
            </ActionPanel>
          )
        }
      />
    )
  }
  else {
    content = (
      <>
        {activeAccounts.length > 0 && (
          <List.Section title="Current Account">
            {activeAccounts.map(account =>
              renderAccountItem(account, switchingAccountId, handleSwitchAccount, reloadAccounts),
            )}
          </List.Section>
        )}

        {otherAccounts.length > 0 && (
          <List.Section title="Other Accounts">
            {otherAccounts.map(account =>
              renderAccountItem(account, switchingAccountId, handleSwitchAccount, reloadAccounts),
            )}
          </List.Section>
        )}
      </>
    )
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search accounts by email or label"
    >
      {content}
    </List>
  )
}

function renderAccountItem(
  account: Account,
  switchingAccountId: string | undefined,
  onSwitch: (account: Account) => Promise<void>,
  onReload: () => void,
): ReactElement {
  const isSwitching = switchingAccountId === account.id

  return (
    <List.Item
      key={account.id}
      icon={getAccountIcon(account, switchingAccountId)}
      title={getAccountTitle(account)}
      subtitle={getAccountSubtitle(account)}
      keywords={getAccountKeywords(account)}
      accessories={getAccountAccessories(account, switchingAccountId)}
      actions={
        (
          <ActionPanel>
            <Action
              title={isSwitching ? 'Switching...' : 'Switch Account'}
              icon={isSwitching ? Icon.CircleProgress : Icon.ArrowRightCircle}
              onAction={isSwitching
                ? undefined
                : () => {
                    void onSwitch(account)
                  }}
            />
            <Action
              title="Reload Accounts"
              icon={Icon.Repeat}
              onAction={onReload}
            />
            <Action.CopyToClipboard
              title="Copy Email"
              content={account.email}
            />
          </ActionPanel>
        )
      }
    />
  )
}

function getAccountAccessories(account: Account, switchingAccountId?: string): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = []

  if (switchingAccountId === account.id) {
    accessories.push({
      tag: {
        value: 'Switching',
        color: Color.Orange,
      },
    })
  }
  else if (account.isActive) {
    accessories.push({
      tag: {
        value: 'Active',
        color: Color.Green,
      },
    })
  }

  if (account.plan)
    accessories.push({ tag: account.plan })

  if (account.usage5h)
    accessories.push({ text: `5H ${account.usage5h}` })

  if (account.weeklyUsage)
    accessories.push({ text: `Week ${account.weeklyUsage}` })

  // if (account.lastActivity)
  //   accessories.push({ text: account.lastActivity })

  return accessories
}

function getAccountIcon(account: Account, switchingAccountId?: string) {
  if (switchingAccountId === account.id) {
    return {
      source: Icon.CircleProgress,
      tintColor: Color.Orange,
    }
  }

  if (account.isActive) {
    return {
      source: Icon.CheckCircle,
      tintColor: Color.Green,
    }
  }

  return Icon.PersonCircle
}

function getAccountKeywords(account: Account): string[] {
  return [account.email, account.label, account.plan].filter(Boolean) as string[]
}

function getAccountSubtitle(account: Account): string | undefined {
  if (!account.label)
    return undefined

  return account.email
}

function getAccountTitle(account: Account): string {
  return account.label || account.email
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message

  return 'Unknown error'
}
