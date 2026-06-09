import type { BuildMode, EffectiveProfile, GlobalNuxterConfigFile, NuxterConfigFile, ProfileConfig } from '../types/nuxter'

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { detectPackageManager, readPackageInfo } from '../project/detect'

const CONFIG_VERSION = 1

export const PROJECT_CONFIG_PATH = '.nuxter/config.json'
export const GLOBAL_CONFIG_PATH = '.nuxter/config.json'

const BASE_PROFILE_DEFAULTS: ProfileConfig = {
  envInit: [
    '[ -f /etc/profile ] && . /etc/profile || true',
    '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" || true',
  ],
  ssh: {
    port: 22,
    username: 'root',
    readyTimeout: 20000,
  },
  remote: {
    distDir: 'dist',
    bakDir: 'bak',
  },
  build: {
    mode: 'ssr',
    archive: 'dist.tar.gz',
    excludes: ['.DS_Store', '._*', '__MACOSX'],
  },
  process: {
    action: 'reload',
  },
  webServer: {
    type: 'nginx',
    reloadCommand: 'nginx -s reload',
    owner: 'auto',
    group: 'auto',
  },
  retain: {
    backups: 5,
  },
}

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

  const merged = mergeProfile({ ...BASE_PROFILE_DEFAULTS, ssh: {} }, globalConfig.defaults, projectConfig.defaults, rawProfile)
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
      port: ssh?.port || BASE_PROFILE_DEFAULTS.ssh!.port!,
      username: ssh?.username || BASE_PROFILE_DEFAULTS.ssh!.username!,
      privateKey: requireString(ssh?.privateKey, 'ssh.privateKey'),
      readyTimeout: ssh?.readyTimeout || BASE_PROFILE_DEFAULTS.ssh!.readyTimeout!,
      passphrase: ssh?.passphrase,
    },
    remote: {
      root: requireString(merged.remote?.root, 'remote.root'),
      distDir: merged.remote?.distDir || BASE_PROFILE_DEFAULTS.remote!.distDir!,
      bakDir: merged.remote?.bakDir || BASE_PROFILE_DEFAULTS.remote!.bakDir!,
    },
    build: {
      mode: merged.build?.mode || BASE_PROFILE_DEFAULTS.build!.mode!,
      command: requireString(merged.build?.command, 'build.command'),
      output: merged.build?.output || defaultBuildOutput(merged.build?.mode),
      archive: merged.build?.archive || BASE_PROFILE_DEFAULTS.build!.archive!,
      excludes: merged.build?.excludes || BASE_PROFILE_DEFAULTS.build!.excludes!,
    },
    process: {
      type: merged.process?.type || (merged.build?.mode === 'ssr' ? 'pm2' : 'none'),
      name: merged.process?.name,
      action: merged.process?.action || BASE_PROFILE_DEFAULTS.process!.action!,
    },
    webServer: {
      type: merged.webServer?.type || BASE_PROFILE_DEFAULTS.webServer!.type!,
      reloadCommand: merged.webServer?.reloadCommand || BASE_PROFILE_DEFAULTS.webServer!.reloadCommand!,
      owner: merged.webServer?.owner || BASE_PROFILE_DEFAULTS.webServer!.owner!,
      group: merged.webServer?.group || BASE_PROFILE_DEFAULTS.webServer!.group!,
    },
    retain: {
      backups: merged.retain?.backups || BASE_PROFILE_DEFAULTS.retain!.backups!,
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

function defaultBuildOutput(mode?: BuildMode): string {
  return mode === 'static' ? '.output/public' : '.output'
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
