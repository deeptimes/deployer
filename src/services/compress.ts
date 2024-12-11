import type { DeployToolConfig } from '../types'

import { exec } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import chalk from 'chalk'

import { formatFileSize } from '../utils/formater'

const execAsync = promisify(exec)

/**
 * 使用系统命令压缩指定目录下的文件到一个tar.gz文件中，并包含目录名
 * @param {string} cfgs.output 要压缩的文件夹路径, 默认`.output`
 * @param {string} cfgs.dist 输出的压缩文件名称，默认`dist.tar.gz`
 * @param {string} cfgs.temp 临时目录路径，默认`temp`
 */

export async function compressFiles(cfgs: DeployToolConfig) {
  try {
    /* 排除文件 */
    const excludesParams = cfgs.excludes.map(item => `--exclude='${item}'`).join(' ')

    /* 构建完整的输出路径 */
    const distFilePath = path.join(process.cwd(), cfgs.temp, cfgs.dist)

    /* 构建压缩命令，不包含目录名 */
    const command = `tar -czf ${distFilePath} ${excludesParams} -C ${cfgs.output} .`

    /* 执行压缩命令 */
    const { stdout, stderr } = await execAsync(command)

    /* 反馈信息 */
    if (stderr) {
      console.error('压缩错误:', stderr)
    }
    else {
      // 获取压缩文件的大小
      const stats = await stat(distFilePath)
      console.log(`完成压缩: 文件大小 ${formatFileSize(stats.size)}`)
      console.log(`压缩文件: ${cfgs.temp}/${cfgs.dist}`)
    }
  }
  catch (error) {
    console.error('执行压缩命令出错:', error)
  }
}
