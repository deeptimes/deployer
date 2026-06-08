export type BuildMode = 'ssr' | 'static' | 'custom'
export type ServiceType = 'pm2' | 'none'
export type WebServerType = 'nginx' | 'none'

export interface PackageInfo {
  name?: string
  version?: string
  scripts?: Record<string, string>
}

export interface NuxterConfigFile {
  version: 1
  project?: {
    name?: string
    packageManager?: string
  }
  defaults?: Partial<ProfileConfig>
  profiles: Record<string, ProfileConfig>
}

export interface GlobalNuxterConfigFile {
  version?: 1
  identities?: Record<string, SSHProfileConfig>
  defaults?: Partial<ProfileConfig>
}

export interface SSHProfileConfig {
  host?: string
  port?: number
  username?: string
  privateKey?: string
  passphrase?: string
  readyTimeout?: number
}

export interface ProfileConfig {
  envInit?: string[]
  ssh?: SSHProfileConfig & {
    identity?: string
  }
  remote?: {
    root?: string
    distDir?: string
    bakDir?: string
  }
  build?: {
    mode?: BuildMode
    command?: string
    output?: string
    archive?: string
    excludes?: string[]
  }
  process?: {
    type?: ServiceType
    name?: string
    action?: 'reload' | 'restart'
  }
  webServer?: {
    type?: WebServerType
    reloadCommand?: string
    owner?: string
    group?: string
  }
  retain?: {
    backups?: number
  }
}

export interface EffectiveProfile {
  name: string
  projectRoot: string
  projectName: string
  packageManager: string
  envInit: string[]
  ssh: Required<Pick<SSHProfileConfig, 'host' | 'port' | 'username' | 'privateKey' | 'readyTimeout'>> & {
    passphrase?: string
  }
  remote: {
    root: string
    distDir: string
    bakDir: string
  }
  build: {
    mode: BuildMode
    command: string
    output: string
    archive: string
    excludes: string[]
  }
  process: {
    type: ServiceType
    name?: string
    action: 'reload' | 'restart'
  }
  webServer: {
    type: WebServerType
    reloadCommand: string
    owner: string
    group: string
  }
  retain: {
    backups: number
  }
}

export interface CLIOptions {
  yes: boolean
  noBuild: boolean
  dryRun: boolean
  target?: string
}

export interface RemoteCommandResult {
  stdout: string
  stderr: string
  code: number
}

export interface BackupInfo {
  id: string
  file: string
}
