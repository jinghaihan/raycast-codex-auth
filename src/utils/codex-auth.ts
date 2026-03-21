import type { CodexAuthCommandFailure, CodexAuthCommandResult } from '../types'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import {
  CODEX_AUTH_BIN_ENTRY,
  CODEX_AUTH_BINARY,
  CODEX_AUTH_COMMAND_NOT_FOUND_MESSAGE,
  CODEX_AUTH_MAX_BUFFER,
  CODEX_AUTH_UNKNOWN_ERROR_MESSAGE,
} from '../constants'

interface CodexAuthCommandTarget {
  command: string
  commandArgs: string[]
}

function formatFailureMessage(stderr: string, stdout: string, exitCode: number) {
  const output = `${stderr}\n${stdout}`.trim()
  const lastLine = output.split('\n').filter(Boolean).at(-1)
  return lastLine || `codex-auth exited with code ${exitCode}`
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function resolveExitCode(error: unknown) {
  if (isErrnoException(error) && typeof error.code === 'number')
    return error.code

  return 1
}

function resolveCommandTarget(): CodexAuthCommandTarget {
  const require = createRequire(import.meta.url)

  try {
    const scriptPath = require.resolve(CODEX_AUTH_BIN_ENTRY)
    return {
      command: process.execPath,
      commandArgs: [scriptPath],
    }
  }
  catch {
    return {
      command: CODEX_AUTH_BINARY,
      commandArgs: [],
    }
  }
}

export class CodexAuthCommandError extends Error {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string

  constructor(options: CodexAuthCommandFailure) {
    const message = formatFailureMessage(options.stderr, options.stdout, options.exitCode)
    super(message)
    this.name = 'CodexAuthCommandError'
    this.args = options.args
    this.exitCode = options.exitCode
    this.stdout = options.stdout
    this.stderr = options.stderr
  }
}

async function runWithTarget(target: CodexAuthCommandTarget, args: string[]) {
  return new Promise<CodexAuthCommandResult>((resolve, reject) => {
    execFile(
      target.command,
      [...target.commandArgs, ...args],
      {
        encoding: 'utf8',
        maxBuffer: CODEX_AUTH_MAX_BUFFER,
      },
      (error, stdout, stderr) => {
        const normalizedStdout = stdout.trim()
        const normalizedStderr = stderr.trim()

        if (!error) {
          resolve({
            stdout: normalizedStdout,
            stderr: normalizedStderr,
          })
          return
        }

        if (isErrnoException(error) && error.code === 'ENOENT') {
          reject(new Error(CODEX_AUTH_COMMAND_NOT_FOUND_MESSAGE))
          return
        }

        reject(new CodexAuthCommandError({
          args,
          exitCode: resolveExitCode(error),
          stdout: normalizedStdout,
          stderr: normalizedStderr,
        }))
      },
    )
  })
}

export async function runCodexAuth(args: string[]) {
  return runWithTarget(resolveCommandTarget(), args)
}

export async function switchCodexAccount(target: string) {
  return runCodexAuth(['switch', target])
}

export function getCodexAuthErrorMessage(error: unknown) {
  if (error instanceof CodexAuthCommandError)
    return error.message
  if (error instanceof Error)
    return error.message

  return CODEX_AUTH_UNKNOWN_ERROR_MESSAGE
}
