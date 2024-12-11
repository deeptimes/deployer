import type { ConnectConfig } from 'ssh2'

export interface CommandError extends Error {
  stdout?: string
  stderr?: string
  code?: number
}

export interface CommandResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
}

export interface SSHConfig extends Omit<ConnectConfig, 'privateKey'> {
  host: string
  port: number
  username: string
  privateKey: string // 这里只接受字符串路径
  readyTimeout: number
}
