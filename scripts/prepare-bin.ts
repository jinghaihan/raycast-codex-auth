import { chmod, copyFile, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'

const GENERATED_BINARY_NAMES = ['codex-auth', 'codex-auth.exe'] as const

interface BinaryPackageInfo {
  binaryName: typeof GENERATED_BINARY_NAMES[number]
  packageName: string
}

function getBinaryPackageInfo(): BinaryPackageInfo {
  const key = `${process.platform}:${process.arch}`

  switch (key) {
    case 'linux:x64':
      return {
        binaryName: 'codex-auth',
        packageName: '@loongphy/codex-auth-linux-x64',
      }
    case 'darwin:arm64':
      return {
        binaryName: 'codex-auth',
        packageName: '@loongphy/codex-auth-darwin-arm64',
      }
    case 'darwin:x64':
      return {
        binaryName: 'codex-auth',
        packageName: '@loongphy/codex-auth-darwin-x64',
      }
    case 'win32:x64':
      return {
        binaryName: 'codex-auth.exe',
        packageName: '@loongphy/codex-auth-win32-x64',
      }
    default:
      throw new Error(`Unsupported platform for bundling codex-auth: ${key}`)
  }
}

async function syncCodexAuthBinary(): Promise<void> {
  const require = createRequire(import.meta.url)
  const { binaryName, packageName } = getBinaryPackageInfo()
  const packageJsonPath = require.resolve(`${packageName}/package.json`)
  const packageRoot = dirname(packageJsonPath)
  const sourceBinary = join(packageRoot, 'bin', binaryName)
  const targetDirectory = join(process.cwd(), 'assets', 'bin')
  const targetBinary = join(targetDirectory, binaryName)

  await mkdir(targetDirectory, { recursive: true })
  await Promise.all(
    GENERATED_BINARY_NAMES
      .filter(name => name !== binaryName)
      .map(name => rm(join(targetDirectory, name), { force: true })),
  )
  await copyFile(sourceBinary, targetBinary)
  await chmod(targetBinary, 0o755)
}

await syncCodexAuthBinary()
