import process from 'node:process'
import chalk from 'chalk'
import { buildProject } from './build/nuxt'
import { loadConfig } from './config'
import { confirmChoices, getOptions } from './options'
import { cleanLocal } from './services/clean'
import { compressFiles } from './services/compress'
import { remoteOperation } from './services/remote'
import { SSHClient } from './services/SSHClient'
import { uploadFile } from './services/upload'
import { clearScreen } from './utils/clearScreen'
import { setupExitHandlers } from './utils/exit'
import { formatDateTime } from './utils/formater'
import { printSeparator, welcome } from './utils/helper'

export default async function main() {
  try {
    const config = await loadConfig()

    /* 清屏 */
    await clearScreen()

    /* 处理退出 */
    setupExitHandlers()

    /* 欢迎标题 */
    welcome(config.package.name)

    const ssh = await SSHClient.create()

    /* 建立远程连接 */
    await ssh.connect()
    const sftp = await ssh.startSFTP()

    /* 开始执行各种输入 */
    const opts = await getOptions(ssh, config)

    /* 确认全部输入 */
    const confirmed = await confirmChoices({
      渲染模式: chalk.cyan(opts.render),
      重新打包: opts.rebuild ? chalk.green('是') : chalk.red('否'),
      // 当前应用: chalk.yellow(opts.app),
    })

    /**
     * 确认后：执行系列操作
     */
    if (confirmed) {
      console.log(chalk.magentaBright('\n已确认！开始执行发布！'))
      printSeparator(48)

      /* 编译打包 */
      if (opts.rebuild) {
        await buildProject(config, opts)
      }

      /* 文件压缩 */
      await compressFiles(config)

      /* 发布上传 */
      await uploadFile(sftp, config, opts)

      /* 远程操作 */
      await remoteOperation(ssh, config, opts)

      /* 清理工作 */
      await cleanLocal(config)

      printSeparator(48)
    }
    else {
      console.warn('已放弃全部操作！')
    }

    /* End. */
    ssh.close()
    console.log(`Deployed on ${chalk.blue(formatDateTime())}! Hava a nice day...\n`)
  }
  catch (error) {
    console.error('主程序错误:', error.message)
    process.exit(1)
  }
  finally {
    process.stdin.setRawMode(false)
    process.stdin.removeAllListeners('keypress')
  }
}
