import type { Buffer } from 'node:buffer'
import type { ConnectConfig, SFTPWrapper } from 'ssh2'
import type { EffectiveProfile, RemoteCommandResult } from '../types/nuxter'

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'ssh2'
import { commandWithEnv } from '../utils/shell'

export class RemoteClient {
  private conn = new Client()
  private sftp?: SFTPWrapper

  constructor(private readonly profile: EffectiveProfile) {}

  async connect(): Promise<void> {
    const ssh = this.profile.ssh
    const config: ConnectConfig = {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      privateKey: readFileSync(resolveHome(ssh.privateKey)),
      passphrase: ssh.passphrase,
      readyTimeout: ssh.readyTimeout,
    }

    await new Promise<void>((resolve, reject) => {
      this.conn
        .once('ready', resolve)
        .once('error', reject)
        .connect(config)
    })
  }

  async exec(command: string, options: { env?: boolean } = {}): Promise<RemoteCommandResult> {
    const finalCommand = options.env === false ? command : commandWithEnv(command, this.profile.envInit)

    return new Promise((resolve, reject) => {
      this.conn.exec(finalCommand, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream.on('data', (data: Buffer | string) => {
          stdout += data.toString()
        })
        stream.stderr.on('data', (data: Buffer | string) => {
          stderr += data.toString()
        })
        stream.on('close', (code: number) => {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code })
        })
        stream.on('error', reject)
      })
    })
  }

  async mustExec(command: string, label: string, options: { env?: boolean } = {}): Promise<RemoteCommandResult> {
    const result = await this.exec(command, options)
    if (result.code !== 0) {
      const details = result.stderr || result.stdout || `exit code ${result.code}`
      throw new Error(`${label} 失败: ${details}`)
    }
    return result
  }

  async upload(localFile: string, remoteFile: string): Promise<void> {
    if (!this.sftp) {
      this.sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
        this.conn.sftp((err, sftp) => {
          if (err)
            reject(err)
          else
            resolve(sftp)
        })
      })
    }

    await new Promise<void>((resolve, reject) => {
      this.sftp!.fastPut(localFile, remoteFile, (err) => {
        if (err)
          reject(err)
        else
          resolve()
      })
    })
  }

  close(): void {
    this.sftp?.end()
    this.conn.end()
  }
}

function resolveHome(path: string): string {
  if (path === '~')
    return homedir()
  if (path.startsWith('~/'))
    return join(homedir(), path.slice(2))
  return path
}
