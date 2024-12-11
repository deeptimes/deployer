import type { Buffer } from 'node:buffer'
import type { ConnectConfig, SFTPWrapper } from 'ssh2'
import type { CommandError, CommandResult, SSHConfig } from '../types/ssh'

import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from 'ssh2'
import { loadConfig } from '../config'

export class SSHClient {
  private conn: Client
  private config: ConnectConfig

  /* 解析主目录 */
  private resolveHome(filePath: string): string {
    if (filePath[0] === '~') {
      return path.join(os.homedir(), filePath.slice(1))
    }
    return filePath
  }

  private constructor(cfgSSH: SSHConfig) {
    this.conn = new Client()
    this.config = {
      ...cfgSSH,
      privateKey: readFileSync(this.resolveHome(cfgSSH.privateKey)),
    }
  }

  /* 静态工厂方法创建实例 */
  public static async create(): Promise<SSHClient> {
    const deployConfig = await loadConfig()
    return new SSHClient(deployConfig.ssh)
  }

  /* 建立连接 */
  public async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.conn
        .on('ready', () => {
          console.info('')
          resolve()
        })
        .on('error', (err: Error) => {
          console.error('SSH Client :: 连接错误:', err.message)
          reject(err)
        })
        .connect(this.config)
    })
  }

  /* 执行远程连接命令 */
  public execCommand(command: string): Promise<{ stdout: string, stderr: string, code: number } | CommandError> {
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(err.message))
          return
        }

        let dataBuffer = ''
        let errorBuffer = ''

        stream.on('data', (data: Buffer | string) => {
          dataBuffer += data.toString()
        })

        stream.stderr.on('data', (data: Buffer | string) => {
          errorBuffer += data.toString()
        })

        stream.on('close', (code: number) => {
          if (code === 0) {
            resolve({ stdout: dataBuffer.trim(), stderr: errorBuffer.trim(), code })
          }
          else {
            const error = new Error(`Command exited with code ${code}`) as CommandError
            error.stdout = dataBuffer.trim()
            error.stderr = errorBuffer.trim()
            error.code = code
            resolve(error)
          }
        })

        stream.on('error', (streamError: Error) => {
          const error = new Error(streamError.message) as CommandError
          error.stdout = dataBuffer.trim()
          error.stderr = errorBuffer.trim()
          reject(error)
        })
      })
    })
  }

  /* 执行远程连接命令 */
  public async useExeCommand(command: string, logger?: string): Promise<CommandResult> {
    try {
      const result = await this.execCommand(command)

      // 处理 Error 类型的结果
      if (result instanceof Error) {
        const errorResult = result as CommandError
        return {
          success: false,
          code: errorResult.code || null,
          stdout: errorResult.stdout || '',
          stderr: errorResult.stderr || '',
        }
      }

      // 处理正常执行结果
      if (result.stdout.trim() === '' && result.stderr.trim() === '') {
        console.log(logger)
      }
      else {
        if (result.stdout) {
          console.log('STDOUT:', result.stdout)
        }
        if (result.stderr) {
          console.log('STDERR:', result.stderr)
        }
      }

      return {
        success: result.code === 0,
        code: result.code,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      }
    }
    catch (error) {
      const err = error as Error
      console.error(`远程命令执行失败: ${err.message}`)
      return {
        success: false,
        code: (error as CommandError).code || null,
        stdout: '',
        stderr: err.message || '',
      }
    }
  }

  /* 建立SFTP */
  public async startSFTP(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) {
          console.error('SSH Client :: SFTP Error:', err)
          return reject(err)
        }
        resolve(sftp)
      })
    })
  }

  /* 关闭连接 */
  public close(): void {
    this.conn.end()
    console.info('\n退出远程连接...')
  }
}
