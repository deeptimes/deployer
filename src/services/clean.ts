import type { DeployToolConfig } from '../types'

import { exec } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/* 执行清理 */
export async function cleanLocal(cfgs: DeployToolConfig) {
  try {
    const localFile = path.join(process.cwd(), cfgs.temp, cfgs.dist)
    const { stdout, stderr } = await execAsync(`rm -rf ${localFile}`)
    console.log('清理：本地临时文件清理完毕！')
  }
  catch (error) {
    console.error('本地清理命令错误:', error)
    throw error // 继续抛出错误，让调用者处理异常情况
  }
}
