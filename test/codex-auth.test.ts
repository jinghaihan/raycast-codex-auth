import type { Account, CodexAuthRun } from '../src/codex-auth'
import { describe, expect, it, vi } from 'vitest'
import { listAccounts, parseAccounts, switchAccount } from '../src/codex-auth'

describe('parseAccounts', () => {
  it('parses grouped accounts from codex-auth list output', () => {
    const output = `
Need to install the following packages:
@loongphy/codex-auth@0.2.2
Ok to proceed? (y)

  ACCOUNT                PLAN  5H USAGE  WEEKLY USAGE  LAST ACTIVITY
--------------------------------------------------------------------
  jhh19980114@gmail.com
*   team #1              team  -         -             -
    team #2              team  100%      100%          14d ago
`

    expect(parseAccounts(output)).toEqual([
      {
        id: 'jhh19980114@gmail.com#1',
        email: 'jhh19980114@gmail.com',
        label: 'team #1',
        plan: 'team',
        usage5h: undefined,
        weeklyUsage: undefined,
        lastActivity: undefined,
        isActive: true,
      },
      {
        id: 'jhh19980114@gmail.com#2',
        email: 'jhh19980114@gmail.com',
        label: 'team #2',
        plan: 'team',
        usage5h: '100%',
        weeklyUsage: '100%',
        lastActivity: '14d ago',
        isActive: false,
      },
    ])
  })

  it('parses standalone account rows', () => {
    const output = `
  ACCOUNT            PLAN  5H USAGE     WEEKLY USAGE  LAST ACTIVITY
-------------------------------------------------------------------
* john@example.com   pro   14% (16:43)  22%          Now
  work@example.com   team  -            100%         4h ago
`

    expect(parseAccounts(output)).toEqual([
      {
        id: 'john@example.com',
        email: 'john@example.com',
        plan: 'pro',
        usage5h: '14% (16:43)',
        weeklyUsage: '22%',
        lastActivity: 'Now',
        isActive: true,
      },
      {
        id: 'work@example.com',
        email: 'work@example.com',
        plan: 'team',
        usage5h: undefined,
        weeklyUsage: '100%',
        lastActivity: '4h ago',
        isActive: false,
      },
    ])
  })

  it('throws when no accounts table is present', () => {
    expect(() => parseAccounts('hello')).toThrowError('could not find the accounts table header in codex-auth list output')
  })
})

describe('listAccounts', () => {
  it('calls the list command and parses accounts', async () => {
    const run = vi.fn<CodexAuthRun>().mockResolvedValue({
      stdout: `
  ACCOUNT            PLAN  5H USAGE  WEEKLY USAGE  LAST ACTIVITY
----------------------------------------------------------------
* john@example.com   pro   14%       22%           Now
`,
      stderr: '',
    })

    await expect(listAccounts(run)).resolves.toEqual([
      {
        id: 'john@example.com',
        email: 'john@example.com',
        plan: 'pro',
        usage5h: '14%',
        weeklyUsage: '22%',
        lastActivity: 'Now',
        isActive: true,
      },
    ])
    expect(run).toHaveBeenCalledWith(['list'])
  })
})

describe('switchAccount', () => {
  it('switches a grouped account by writing the selection index to stdin', async () => {
    const run = vi.fn<CodexAuthRun>().mockResolvedValue({
      stdout: '',
      stderr: '',
    })

    await switchAccount('jhh19980114@gmail.com#2', run)

    expect(run).toHaveBeenCalledWith(['switch', 'jhh19980114@gmail.com'], {
      stdin: '2\n',
    })
  })

  it('switches a standalone account without stdin', async () => {
    const run = vi.fn<CodexAuthRun>().mockResolvedValue({
      stdout: '',
      stderr: '',
    })

    await switchAccount('john@example.com', run)

    expect(run).toHaveBeenCalledWith(['switch', 'john@example.com'], {
      stdin: undefined,
    })
  })

  it('accepts an account object and switches by its id', async () => {
    const run = vi.fn<CodexAuthRun>().mockResolvedValue({
      stdout: '',
      stderr: '',
    })

    const account: Account = {
      id: 'john@example.com',
      email: 'john@example.com',
      isActive: true,
    }

    await switchAccount(account, run)

    expect(run).toHaveBeenCalledWith(['switch', 'john@example.com'], {
      stdin: undefined,
    })
  })
})
