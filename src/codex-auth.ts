import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import stripAnsi from 'strip-ansi'

const ACCOUNTS_HEADER_ERROR = 'could not find the accounts table header in codex-auth list output'
const ACCOUNT_ROW_ERROR = 'expected at least 5 columns in codex-auth list output'
const BIN_RELATIVE_PATH = ['node_modules', '.bin', 'codex-auth']
const GROUP_ROW_ERROR = 'found a grouped account row before any group email header in codex-auth list output'
const MAX_BUFFER = 10 * 1024 * 1024
const NOT_FOUND_ERROR = 'codex-auth command was not found; install dependencies and run `pnpm install`'
const PACKAGE_BIN_RELATIVE_PATH = ['node_modules', '@loongphy', 'codex-auth', 'bin', 'codex-auth.js']

export interface Account {
  id: string
  email: string
  label?: string
  plan?: string
  usage5h?: string
  weeklyUsage?: string
  lastActivity?: string
  isActive: boolean
}

export interface CommandResult {
  stdout: string
  stderr: string
}

export interface RunOptions {
  stdin?: string
}

export type CodexAuthRun = (
  args: string[],
  options?: RunOptions,
) => Promise<CommandResult>

interface CommandTarget {
  command: string
  args: string[]
}

interface ParsedRow {
  cells: string[]
  isActive: boolean
  isGrouped: boolean
}

interface ResolvedCommandTarget {
  searchedPaths: string[]
  target: CommandTarget
}

export class CodexAuthCommandError extends Error {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string

  constructor(args: string[], exitCode: number, stdout: string, stderr: string) {
    super(formatFailureMessage(stderr, stdout, exitCode))
    this.name = 'CodexAuthCommandError'
    this.args = args
    this.exitCode = exitCode
    this.stdout = stdout
    this.stderr = stderr
  }
}

export async function listAccounts(run: CodexAuthRun = runCodexAuth): Promise<Account[]> {
  const { stdout } = await run(['list'])
  return parseAccounts(stdout)
}

export function parseAccounts(stdout: string): Account[] {
  const lines = stripAnsi(stdout).split(/\r?\n/)
  const headerIndex = lines.findIndex(line => isAccountsHeader(line.trim()))

  if (headerIndex === -1)
    throw new Error(ACCOUNTS_HEADER_ERROR)

  const accounts: Account[] = []
  let currentGroupEmail: string | undefined
  let currentGroupSelection = 0

  for (const line of lines.slice(headerIndex + 1)) {
    const row = parseRow(line)
    if (!row)
      continue

    if (row.cells.length === 1) {
      currentGroupEmail = row.cells[0].trim()
      currentGroupSelection = 0
      continue
    }

    const [name, plan, usage5h, weeklyUsage, lastActivity] = readAccountColumns(row)

    if (row.isGrouped) {
      if (!currentGroupEmail)
        throw new Error(GROUP_ROW_ERROR)

      currentGroupSelection += 1
      accounts.push({
        id: createAccountId(currentGroupEmail, currentGroupSelection),
        email: currentGroupEmail,
        label: normalizeCell(name),
        plan: normalizeCell(plan),
        usage5h: normalizeCell(usage5h),
        weeklyUsage: normalizeCell(weeklyUsage),
        lastActivity: normalizeCell(lastActivity),
        isActive: row.isActive,
      })
      continue
    }

    currentGroupEmail = undefined
    currentGroupSelection = 0

    const email = name.trim()
    accounts.push({
      id: createAccountId(email),
      email,
      plan: normalizeCell(plan),
      usage5h: normalizeCell(usage5h),
      weeklyUsage: normalizeCell(weeklyUsage),
      lastActivity: normalizeCell(lastActivity),
      isActive: row.isActive,
    })
  }

  return accounts
}

export async function runCodexAuth(
  args: string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  const { searchedPaths, target } = await resolveCommandTarget()

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(target.command, [...target.args, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let isFinished = false

    function finish(task: () => void): void {
      if (isFinished)
        return

      isFinished = true
      task()
    }

    function appendOutput(stream: 'stdout' | 'stderr', chunk: Buffer): void {
      const text = chunk.toString('utf8')

      if (stream === 'stdout') {
        stdout += text
        stdoutBytes += chunk.byteLength
      }
      else {
        stderr += text
        stderrBytes += chunk.byteLength
      }

      if (stdoutBytes > MAX_BUFFER || stderrBytes > MAX_BUFFER) {
        child.kill()
        finish(() => reject(new Error(`codex-auth output exceeded the ${MAX_BUFFER}-byte buffer limit`)))
      }
    }

    child.stdout.on('data', chunk => appendOutput('stdout', chunk))
    child.stderr.on('data', chunk => appendOutput('stderr', chunk))

    child.once('error', (error) => {
      finish(() => {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          reject(new Error(formatNotFoundMessage(searchedPaths)))
          return
        }

        reject(error)
      })
    })

    child.once('close', (exitCode) => {
      finish(() => {
        const trimmedStdout = stdout.trim()
        const trimmedStderr = stderr.trim()

        if (exitCode === 0) {
          resolve({
            stdout: trimmedStdout,
            stderr: trimmedStderr,
          })
          return
        }

        reject(new CodexAuthCommandError(
          args,
          typeof exitCode === 'number' ? exitCode : 1,
          trimmedStdout,
          trimmedStderr,
        ))
      })
    })

    child.stdin.end(options.stdin)
  })
}

export async function switchAccount(
  account: Account | string,
  run: CodexAuthRun = runCodexAuth,
): Promise<CommandResult> {
  const { email, selection } = parseAccountId(typeof account === 'string' ? account : account.id)

  return run(['switch', email], {
    stdin: selection ? `${selection}\n` : undefined,
  })
}

function createAccountId(email: string, selection?: number): string {
  if (selection)
    return `${email}#${selection}`

  return email
}

function formatFailureMessage(stderr: string, stdout: string, exitCode: number): string {
  const output = `${stderr}\n${stdout}`.trim()
  const lastLine = output.split('\n').filter(Boolean).at(-1)

  return lastLine || `codex-auth exited with code ${exitCode}`
}

function formatNotFoundMessage(searchedPaths: string[]): string {
  const checkedPaths = searchedPaths
    .filter((path, index) => searchedPaths.indexOf(path) === index)
    .slice(0, 12)

  if (checkedPaths.length === 0)
    return NOT_FOUND_ERROR

  return `${NOT_FOUND_ERROR}\nChecked:\n${checkedPaths.join('\n')}`
}

function getBundledBinaryRelativePaths(): string[][] {
  if (process.platform === 'win32') {
    return [
      ['assets', 'bin', 'codex-auth.exe'],
      ['assets', 'bin', 'codex-auth'],
    ]
  }

  return [['assets', 'bin', 'codex-auth']]
}

function isAccountsHeader(line: string): boolean {
  return Boolean(
    line
    && line.startsWith('ACCOUNT')
    && line.includes('PLAN')
    && line.includes('5H')
    && line.includes('LAST'),
  )
}

function isDividerLine(line: string): boolean {
  return /^[\s-]+$/.test(line)
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function normalizeCell(value: string): string | undefined {
  const cell = value.trim()
  return cell === '-' ? undefined : cell
}

function parseAccountId(accountId: string): { email: string, selection?: number } {
  const match = /^(.*)#(\d+)$/.exec(accountId)

  if (!match)
    return { email: accountId }

  return {
    email: match[1],
    selection: Number(match[2]),
  }
}

function parseRow(line: string): ParsedRow | undefined {
  if (!line.trim() || isDividerLine(line))
    return undefined

  const isActive = line.startsWith('* ')
  const content = line.startsWith('* ') || line.startsWith('  ')
    ? line.slice(2)
    : line

  if (!content.trim())
    return undefined

  return {
    cells: content.trimEnd().split(/\s{2,}/).filter(Boolean),
    isActive,
    isGrouped: content.startsWith('  '),
  }
}

function readAccountColumns(row: ParsedRow): [string, string, string, string, string] {
  if (row.cells.length < 5) {
    throw new Error(`${ACCOUNT_ROW_ERROR}; got ${row.cells.length}`)
  }

  const [name, plan, usage5h, weeklyUsage, lastActivity] = row.cells
  return [name, plan, usage5h, weeklyUsage, lastActivity]
}

async function resolveCommandTarget(): Promise<ResolvedCommandTarget> {
  const searchedPaths: string[] = []

  for (const directory of await getSearchRoots()) {
    for (const current of walkUp(directory)) {
      for (const bundledRelativePath of getBundledBinaryRelativePaths()) {
        const bundledExecutablePath = join(current, ...bundledRelativePath)

        searchedPaths.push(bundledExecutablePath)

        if (canAccess(bundledExecutablePath, constants.X_OK)) {
          return {
            searchedPaths,
            target: {
              command: bundledExecutablePath,
              args: [],
            },
          }
        }
      }

      const executablePath = join(current, ...BIN_RELATIVE_PATH)

      searchedPaths.push(executablePath)

      if (canAccess(executablePath, constants.X_OK)) {
        return {
          searchedPaths,
          target: {
            command: executablePath,
            args: [],
          },
        }
      }

      const scriptPath = join(current, ...PACKAGE_BIN_RELATIVE_PATH)

      searchedPaths.push(scriptPath)

      if (canAccess(scriptPath, constants.F_OK)) {
        return {
          searchedPaths,
          target: {
            command: process.execPath,
            args: [scriptPath],
          },
        }
      }
    }
  }

  return {
    searchedPaths,
    target: {
      command: 'codex-auth',
      args: [],
    },
  }
}

async function getSearchRoots(): Promise<string[]> {
  const roots = new Set<string>()

  addSearchRoot(roots, process.cwd())
  addSearchRoot(roots, process.env.PWD)
  addSearchRoot(roots, process.argv[1] ? dirname(process.argv[1]) : undefined)

  try {
    const raycastApiModule = '@raycast/api'
    const raycast = await import(raycastApiModule)
    addSearchRoot(roots, raycast.environment.assetsPath)
    addSearchRoot(roots, dirname(raycast.environment.assetsPath))
  }
  catch {
  }

  return [...roots]
}

function addSearchRoot(roots: Set<string>, path: string | undefined): void {
  if (!path)
    return

  roots.add(resolve(path))
}

function canAccess(path: string, mode: number): boolean {
  try {
    accessSync(path, mode)
    return true
  }
  catch {
    return false
  }
}

function walkUp(start: string): string[] {
  const directories: string[] = []
  let current = resolve(start)

  while (true) {
    directories.push(current)

    const parent = dirname(current)
    if (parent === current)
      return directories

    current = parent
  }
}
