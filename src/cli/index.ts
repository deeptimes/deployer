import type { CLIOptions, NuxterConfigFile, PackageInfo } from '../types/nuxter'

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { createPrompt, isBackspaceKey, isEnterKey, isTabKey, makeTheme, useKeypress, usePrefix, useState } from '@inquirer/core'
import { confirm, input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { getProjectConfigPath, listProfiles, loadEffectiveProfile } from '../config/nuxter'
import { deployProfile, reloadServices } from '../deploy/deploy'
import { detectBuildCommand, detectPackageManager, readPackageInfo } from '../project/detect'
import { runDoctor } from '../remote/doctor'
import { backupCurrentDist, listRemoteBackups, paths, replaceDist, stageArchive } from '../remote/releases'
import { RemoteClient } from '../ssh/RemoteClient'
import { joinRemotePath } from '../utils/shell'

export async function runCLI(argv = process.argv.slice(2), projectRoot = process.cwd()): Promise<void> {
  const { command, profile, options } = parseArgs(argv)

  if (command === 'init') {
    await initProject(projectRoot)
    return
  }

  if (command === 'profiles') {
    console.log(listProfiles(projectRoot).join('\n'))
    return
  }

  if (!profile) {
    const profiles = safeListProfiles(projectRoot)
    if (profiles.length)
      console.log(`可用 profile: ${profiles.join(', ')}`)
    throw new Error(`请指定 profile，例如: nuxter ${command} prod`)
  }

  const effective = loadEffectiveProfile(projectRoot, profile)

  if (command === 'doctor') {
    await withRemote(effective, remote => runDoctor(remote, effective))
    return
  }

  if (command === 'deploy') {
    if (!options.yes && !options.dryRun) {
      printPlan(effective)
      const ok = await confirm({ message: `确认部署 ${profile}?`, default: false })
      if (!ok)
        return
    }
    await deployProfile(effective, options)
    return
  }

  if (command === 'releases') {
    await withRemote(effective, async (remote) => {
      const backups = await listRemoteBackups(remote, effective)
      if (!backups.length) {
        console.log('暂无备份版本')
        return
      }
      for (const backup of backups)
        console.log(backup.id)
    })
    return
  }

  if (command === 'rollback') {
    await withRemote(effective, async (remote) => {
      const backups = await listRemoteBackups(remote, effective)
      if (!backups.length)
        throw new Error('没有可回滚的备份版本')

      const selectedTarget = options.target || await select({
        message: '选择回滚版本',
        choices: backups.map(backup => ({ name: backup.id, value: backup.id })),
      })
      const target = selectedTarget.replace(/\.tar\.gz$/, '')

      const p = paths(effective)
      const backupFile = joinRemotePath(p.bak, `${target}.tar.gz`)
      const rollbackId = `rollback-${target}`
      const stagePath = await stageArchive(remote, effective, backupFile, rollbackId)
      await backupCurrentDist(remote, effective, `pre-${rollbackId}`)
      await replaceDist(remote, effective, stagePath, rollbackId)
      await reloadServices(remote, effective)
      console.log(`已回滚到 ${target}`)
    })
    return
  }

  throw new Error(`未知命令: ${command}`)
}

function parseArgs(argv: string[]): { command: string, profile?: string, options: CLIOptions } {
  const [command = 'help', profile, ...rest] = argv
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
  }
  if (command === '--version' || command === '-v') {
    console.log('2.0.0')
    process.exit(0)
  }

  const options: CLIOptions = {
    yes: rest.includes('--yes') || rest.includes('-y'),
    noBuild: rest.includes('--no-build'),
    dryRun: rest.includes('--dry-run'),
  }

  const targetIndex = rest.findIndex(item => item === '--target')
  if (targetIndex >= 0)
    options.target = rest[targetIndex + 1]

  return { command, profile: profile?.startsWith('-') ? undefined : profile, options }
}

async function initProject(projectRoot: string): Promise<void> {
  const configPath = getProjectConfigPath(projectRoot)
  if (existsSync(configPath)) {
    const overwrite = await confirm({ message: `${configPath} 已存在，是否覆盖?`, default: false })
    if (!overwrite)
      return
  }

  const pkg = readPackageInfo(projectRoot)
  const packageManager = detectPackageManager(projectRoot)
  const projectName = await inputWithDefault('项目名称', pkg.name || 'nuxter-app')
  const mode = await select<'ssr' | 'static' | 'custom'>({
    message: '默认构建模式',
    choices: [
      { name: 'SSR', value: 'ssr' },
      { name: 'Static/SSG/SPA', value: 'static' },
      { name: 'Custom', value: 'custom' },
    ],
  })
  const command = await selectBuildCommand(pkg, packageManager, mode)
  const output = await inputWithDefault('构建输出目录', mode === 'static' ? 'dist' : '.output')
  const host = await input({ message: 'SSH host' })
  const username = await inputWithDefault('SSH username', 'root')
  const privateKey = await inputWithDefault('SSH private key path', '~/.ssh/id_rsa')
  const remoteRoot = await input({ message: '远程根目录，例如 /www/web/example.com' })
  const pm2Name = mode === 'ssr' ? await input({ message: 'PM2 应用名' }) : ''

  const profile = {
    ssh: {
      host,
      port: 22,
      username,
      privateKey,
      readyTimeout: 20000,
    },
    remote: {
      root: remoteRoot,
      distDir: 'dist',
      bakDir: 'bak',
      nuxterDir: '.nuxter',
      uploadsDir: 'uploads',
      stagingDir: 'staging',
      logsDir: 'logs',
    },
    build: {
      mode,
      command,
      output,
      archive: 'dist.tar.gz',
      excludes: ['.DS_Store', '._*', '__MACOSX'],
    },
    process: mode === 'ssr'
      ? { type: 'pm2', name: pm2Name, action: 'reload' }
      : { type: 'none' },
    webServer: {
      type: 'nginx',
      reloadCommand: 'nginx -s reload',
      owner: 'auto',
      group: 'auto',
    },
    retain: {
      backups: 5,
    },
  } satisfies NuxterConfigFile['profiles'][string]

  const config: NuxterConfigFile = {
    version: 1,
    project: {
      name: projectName,
      packageManager,
    },
    profiles: {
      test: profile,
      staging: profile,
      prod: profile,
    },
  }

  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  console.log(`已生成 ${configPath}`)
  console.log('下一步: nuxter doctor prod')
}

async function selectBuildCommand(pkg: PackageInfo, packageManager: string, mode: 'ssr' | 'static' | 'custom'): Promise<string> {
  const scripts = pkg.scripts || {}
  const scriptNames = Object.keys(scripts)
  const defaultCommand = detectBuildCommand(pkg, packageManager, mode)

  if (!scriptNames.length) {
    return inputWithDefault('构建命令', defaultCommand)
  }

  const run = packageManager === 'npm' ? 'npm run' : `${packageManager} run`
  const prioritized = sortBuildScripts(scriptNames)
  const selected = await select<string>({
    message: '选择构建命令',
    choices: [
      ...prioritized.map(name => ({
        name: `${name}  ->  ${scripts[name]}`,
        value: `${run} ${name}`,
      })),
      { name: '自定义命令', value: '__custom__' },
    ],
    default: defaultCommand || `${run} ${prioritized[0]}`,
  })

  if (selected !== '__custom__')
    return selected

  return inputWithDefault('构建命令', defaultCommand)
}

const inputPreserveDefault = createPrompt<string, { message: string, default: string }>((config, done) => {
  const theme = makeTheme({}, undefined)
  const [status, setStatus] = useState<'idle' | 'done'>('idle')
  const [value, setValue] = useState('')
  const defaultValue = String(config.default || '')
  const prefix = usePrefix({ status, theme })

  useKeypress((key, rl) => {
    if (status !== 'idle')
      return

    if (isEnterKey(key)) {
      const answer = value || defaultValue
      setValue(answer)
      setStatus('done')
      done(answer)
      return
    }

    if (isBackspaceKey(key) && !value) {
      return
    }

    if (isTabKey(key) && !value) {
      rl.clearLine(0)
      rl.write(defaultValue)
      setValue(defaultValue)
      return
    }

    setValue(rl.line)
  })

  const message = theme.style.message(config.message, status)
  const defaultStr = status !== 'done' && !value && defaultValue
    ? theme.style.defaultAnswer(defaultValue)
    : undefined
  const answer = status === 'done' ? theme.style.answer(value) : value

  return [prefix, message, defaultStr, answer].filter(item => item !== undefined).join(' ')
})

function inputWithDefault(message: string, defaultValue: string): Promise<string> {
  return inputPreserveDefault({
    message,
    default: defaultValue,
  }).then(value => value.trim() || defaultValue)
}

function sortBuildScripts(scriptNames: string[]): string[] {
  const score = (name: string) => {
    if (name === 'build')
      return 0
    if (name.startsWith('build:'))
      return 1
    if (name === 'generate' || name === 'ssg')
      return 2
    if (name.includes('build') || name.includes('generate'))
      return 3
    return 4
  }

  return [...scriptNames].sort((left, right) => {
    const diff = score(left) - score(right)
    return diff || left.localeCompare(right)
  })
}

async function withRemote<T>(profile, handler: (remote: RemoteClient) => Promise<T>): Promise<T> {
  const remote = new RemoteClient(profile)
  try {
    await remote.connect()
    return await handler(remote)
  }
  finally {
    remote.close()
  }
}

function printPlan(profile): void {
  console.log(chalk.cyan('部署计划'))
  console.log(`profile: ${profile.name}`)
  console.log(`host: ${profile.ssh.host}`)
  console.log(`remote: ${profile.remote.root}`)
  console.log(`dist: ${profile.remote.distDir}`)
  console.log(`bak: ${profile.remote.bakDir}`)
  console.log(`build: ${profile.build.command}`)
  console.log(`output: ${profile.build.output}`)
  console.log(`process: ${profile.process.type}${profile.process.name ? `:${profile.process.name}` : ''}`)
  console.log(`web: ${profile.webServer.type}`)
}

function safeListProfiles(projectRoot: string): string[] {
  try {
    return listProfiles(projectRoot)
  }
  catch {
    return []
  }
}

function printHelp(): void {
  console.log(`nuxter 2.0

Usage:
  nuxter init
  nuxter doctor <profile>
  nuxter deploy <profile> [--yes] [--no-build] [--dry-run]
  nuxter releases <profile>
  nuxter rollback <profile> [--target <releaseId>]
  nuxter profiles
`)
}
