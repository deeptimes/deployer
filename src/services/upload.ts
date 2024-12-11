import type { SFTPWrapper } from 'ssh2'
import type { DeployToolConfig, Options } from '../types'

import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'

/* 文件上传 */
export async function uploadFile(sftp: SFTPWrapper, cfgs: DeployToolConfig, opts: Options) {
  try {
    const localFile = path.join(process.cwd(), cfgs.temp, cfgs.dist)
    const remoteFile = `${cfgs.remote.root}/${cfgs.remote.site}/${cfgs.dist}`

    return new Promise<void>((resolve, reject) => {
      const putOptions = {
        concurrency: 64,
        chunkSize: 32768, // 32KB
        /**
         * @function step
         * @param transferred: number - 已传输的字节数
         * @param chunk: number - 当前块的大小（字节）
         * @param total: number - 文件总大小（字节）
         */
        step(transferred: number, chunk: number, total: number) {
          updateProgressBar(transferred, total)
        },
      }

      sftp.fastPut(localFile, remoteFile, putOptions, (err) => {
        if (err) {
          console.error('上传文件失败:', err)
          return reject(err)
        }
        console.log(chalk.greenBright('成功！'))
        resolve()
      })
    })
  }
  catch (error) {
    console.error('SSH Error:', error)
  }
}

function updateProgressBar(transferred: number, total: number) {
  const barLength = 20 // 进度条的长度
  const percent = Math.round((transferred / total) * 100) // 计算整数百分比
  const filledBarLength = Math.round((percent / 100) * barLength) // 根据整数百分比确定填充长度
  const bar = '='.repeat(filledBarLength) + '.'.repeat(barLength - filledBarLength) // 构建进度条
  process.stdout.clearLine(0) // 清除当前行的内容
  process.stdout.cursorTo(0) // 将光标移动到行的开始
  process.stdout.write(`上传: [${bar}] 进度(${percent}%)！`) // 输出进度信息
}
