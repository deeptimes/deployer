import { spawn } from 'node:child_process'
import process from 'node:process'

/* 清空屏幕 */
export async function clearScreen(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'cls' : 'clear'
    const clearProcess = spawn(cmd, [], { stdio: 'inherit' })

    clearProcess.on('error', (error) => {
      console.error(`执行清屏命令时出错: ${error}`)
      reject(error)
    })

    clearProcess.on('exit', (code) => {
      if (code === 0) {
        resolve()
      }
      else {
        reject(new Error(`清屏命令退出码: ${code}`))
      }
    })
  })
}
