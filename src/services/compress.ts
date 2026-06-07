import type { DeployToolConfig } from '../types'

import { exec } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
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
    // 确保临时目录存在
    const tempPath = path.join(process.cwd(), cfgs.temp)
    await mkdir(tempPath, { recursive: true })

    const defaultExcludes = ['.DS_Store', '._*', '__MACOSX']
    const excludes = Array.from(new Set([...(cfgs.excludes || []), ...defaultExcludes]))
    const excludesParams = excludes
      .filter(Boolean)
      .map((pattern) => {
        const escaped = pattern.replace(/'/g, `'\\''`)
        return `--exclude='${escaped}'`
      })
      .join(' ')

    /* 构建完整的输出路径 */
    const distFilePath = path.join(process.cwd(), cfgs.temp, cfgs.dist)

    /* 构建压缩命令，不包含目录名 */
    const command = `tar -czf '${distFilePath}' ${excludesParams} -C '${cfgs.output}' .`

    /* 执行压缩命令。macOS tar 默认可能把扩展属性写成 ._* AppleDouble 文件。 */
    const { stderr } = await execAsync(command, {
      env: {
        ...process.env,
        COPYFILE_DISABLE: '1',
      },
    })

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
