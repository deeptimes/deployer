import type { EffectiveProfile, GlobalNuxterConfigFile, NuxterConfigFile, ProfileConfig } from '../types/nuxter'

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { detectPackageManager, readPackageInfo } from '../project/detect'

const CONFIG_VERSION = 1

export const PROJECT_CONFIG_PATH = '.nuxter/config.json'
export const GLOBAL_CONFIG_PATH = '.nuxter/config.json'

export function getProjectConfigPath(projectRoot: string): string {
  return resolve(projectRoot, PROJECT_CONFIG_PATH)
}

export function getGlobalConfigPath(): string {
  return resolve(homedir(), GLOBAL_CONFIG_PATH)
}

export function readProjectConfig(projectRoot: string): NuxterConfigFile {
  const configPath = getProjectConfigPath(projectRoot)
  if (!existsSync(configPath))
    throw new Error(`未找到 ${PROJECT_CONFIG_PATH}，请先运行 nuxter init`)

  const config = readJson<NuxterConfigFile>(configPath)
  if (config.version !== CONFIG_VERSION)
    throw new Error(`不支持的 .nuxter/config.json version: ${config.version}`)
  if (!config.profiles || typeof config.profiles !== 'object')
    throw new Error('.nuxter/config.json 缺少 profiles')

  return config
}

export function readGlobalConfig(): GlobalNuxterConfigFile {
  const configPath = getGlobalConfigPath()
  if (!existsSync(configPath))
    return {}
  const config = readJson<GlobalNuxterConfigFile>(configPath)
  if (config.version && config.version !== CONFIG_VERSION)
    throw new Error(`不支持的全局 nuxter config version: ${config.version}`)
  return config
}

export function listProfiles(projectRoot: string): string[] {
  return Object.keys(readProjectConfig(projectRoot).profiles)
}

export function loadEffectiveProfile(projectRoot: string, profileName: string): EffectiveProfile {
  const projectConfig = readProjectConfig(projectRoot)
  const globalConfig = readGlobalConfig()
  const rawProfile = projectConfig.profiles[profileName]

  if (!rawProfile)
    throw new Error(`profile 不存在: ${profileName}`)

  const merged = mergeProfile(globalConfig.defaults, projectConfig.defaults, rawProfile)
  const identity = merged.ssh?.identity
  const identitySSH = identity ? globalConfig.identities?.[identity] : undefined
  const ssh = { ...identitySSH, ...merged.ssh }

  const pkg = readPackageInfo(projectRoot)
  const packageManager = projectConfig.project?.packageManager || detectPackageManager(projectRoot)

  const effective: EffectiveProfile = {
    name: profileName,
    projectRoot,
    projectName: projectConfig.project?.name || pkg.name || 'nuxter-app',
    packageManager,
    envInit: merged.envInit || [],
    ssh: {
      host: requireString(ssh?.host, 'ssh.host'),
      port: ssh?.port || 22,
      username: requireString(ssh?.username, 'ssh.username'),
      privateKey: requireString(ssh?.privateKey, 'ssh.privateKey'),
      readyTimeout: ssh?.readyTimeout || 20000,
      passphrase: ssh?.passphrase,
    },
    remote: {
      root: requireString(merged.remote?.root, 'remote.root'),
      distDir: merged.remote?.distDir || 'dist',
      bakDir: merged.remote?.bakDir || 'bak',
      nuxterDir: merged.remote?.nuxterDir || '.nuxter',
      uploadsDir: merged.remote?.uploadsDir || 'uploads',
      stagingDir: merged.remote?.stagingDir || 'staging',
      logsDir: merged.remote?.logsDir || 'logs',
    },
    build: {
      mode: merged.build?.mode || 'ssr',
      command: requireString(merged.build?.command, 'build.command'),
      output: merged.build?.output || '.output',
      archive: merged.build?.archive || 'dist.tar.gz',
      excludes: merged.build?.excludes || ['.DS_Store', '._*', '__MACOSX'],
    },
    process: {
      type: merged.process?.type || (merged.build?.mode === 'static' ? 'none' : 'pm2'),
      name: merged.process?.name,
      action: merged.process?.action || 'reload',
    },
    webServer: {
      type: merged.webServer?.type || 'nginx',
      reloadCommand: merged.webServer?.reloadCommand || 'nginx -s reload',
      owner: merged.webServer?.owner || 'auto',
      group: merged.webServer?.group || 'auto',
    },
    retain: {
      backups: merged.retain?.backups || 5,
    },
  }

  validateEffectiveProfile(effective)
  return effective
}

function mergeProfile(...profiles: Array<Partial<ProfileConfig> | undefined>): ProfileConfig {
  return profiles.reduce<ProfileConfig>((acc, profile) => {
    if (!profile)
      return acc
    return {
      ...acc,
      ...profile,
      ssh: { ...acc.ssh, ...profile.ssh },
      remote: { ...acc.remote, ...profile.remote },
      build: { ...acc.build, ...profile.build },
      process: { ...acc.process, ...profile.process },
      webServer: { ...acc.webServer, ...profile.webServer },
      retain: { ...acc.retain, ...profile.retain },
    }
  }, {})
}

function validateEffectiveProfile(profile: EffectiveProfile) {
  if (profile.build.mode === 'ssr' && profile.process.type === 'pm2' && !profile.process.name)
    throw new Error(`profile ${profile.name} 是 SSR + PM2 模式，但缺少 process.name`)
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`配置缺少 ${key}`)
  return value
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  }
  catch (error) {
    throw new Error(`配置文件读取失败 ${file}: ${(error as Error).message}`)
  }
}
