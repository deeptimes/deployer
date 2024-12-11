import type { DeployToolConfig } from '../types'

import { exec } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import chalk from 'chalk'

const execAsync = promisify(exec)

/* 本地打包 */
export async function buildProject(config: DeployToolConfig, opts) {
  try {
    /* 根据选项决定执行的命令 */
    const command = opts.render === 'ssr' ? 'nuxt build' : 'nuxt generate'

    // 创建Build临时目录(存放日志和压缩包)
    await mkdir(config.temp, { recursive: true })

    /* 创建日志文件 */
    const logFile = path.join(process.cwd(), config.temp, opts.render === 'ssr' ? 'buildssr.log' : 'buildssg.log')

    console.log(`开始执行 ${command} 编译打包进行中...`)
    console.log('...')

    const { stdout, stderr } = await execAsync(command)

    /* 输出命令执行结果并写入日志文件 */
    let logOutput = `============ Build Result Output ============\n${stdout}\n`
    if (stderr) {
      console.error('打包失败:', stderr)
      logOutput += `打包失败:\n${stderr}\n`
    }

    // 写入日志文件
    await writeFile(logFile, logOutput, { flag: 'a' }) // 追加模式

    console.log('Nuxt打包结束...')
  }
  catch (error) {
    console.error('项目打包命令执行失败:', error)
  }
}
