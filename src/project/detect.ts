import type { PackageInfo } from '../types/nuxter'

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readPackageInfo(projectRoot: string): PackageInfo {
  const packagePath = resolve(projectRoot, 'package.json')
  if (!existsSync(packagePath))
    return {}

  return JSON.parse(readFileSync(packagePath, 'utf-8')) as PackageInfo
}

export function detectPackageManager(projectRoot: string): string {
  if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml')))
    return 'pnpm'
  if (existsSync(resolve(projectRoot, 'yarn.lock')))
    return 'yarn'
  if (existsSync(resolve(projectRoot, 'bun.lockb')) || existsSync(resolve(projectRoot, 'bun.lock')))
    return 'bun'
  if (existsSync(resolve(projectRoot, 'package-lock.json')))
    return 'npm'
  return 'pnpm'
}

export function detectBuildCommand(pkg: PackageInfo, packageManager: string, mode: 'ssr' | 'static' | 'custom'): string {
  const run = packageManager === 'npm' ? 'npm run' : `${packageManager} run`
  const scripts = pkg.scripts || {}

  if (mode === 'static') {
    if (scripts.generate)
      return `${run} generate`
    if (scripts.ssg)
      return `${run} ssg`
  }

  if (scripts.build)
    return `${run} build`

  return ''
}
