import type { CommandError, DeployToolConfig, Options } from './types'
import confirm from '@inquirer/confirm'
import select from '@inquirer/select'
import chalk from 'chalk'
import { printSeparator } from './utils/helper'

export async function getOptions(ssh, config: DeployToolConfig): Promise<Options> {
  const options = {} as Options

  const remoteRoot = config.remote?.root?.replace(/\/+$/, '')
  const remoteSite = config.remote?.site?.replace(/^\/+/, '')
  const remoteDir = remoteSite ? `${remoteRoot}/${remoteSite}` : remoteRoot

  const formatDateTag = (): string => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `test-${year}${month}${day}`
  }

  const ensureRemoteDirConfigured = () => {
    if (!remoteRoot) {
      throw new Error('远程目录未在配置中设置，请检查 deploy.config.js 的 remote.root')
    }
    return remoteDir || remoteRoot
  }

  /* 0.开始部署 / 测试目录 */
  while (true) {
    const action = await select({
      message: '请选择部署前操作',
      choices: [
        { name: '开始部署', value: 'deploy' },
        { name: '测试目录', value: 'test-dir' },
      ],
    }, { clearPromptOnDone: true })

    if (action === 'deploy') {
      break
    }

    if (action === 'test-dir') {
      const targetDir = ensureRemoteDirConfigured()
      const testFile = formatDateTag()
      const remoteFile = `${targetDir}/${testFile}`

      const createResult = await ssh.execCommand(`cd "${targetDir}" && touch "${testFile}"`)
      if (createResult instanceof Error) {
        const errorResult = createResult as CommandError
        const details = errorResult.stderr || errorResult.stdout || errorResult.message
        throw new Error(`测试目录失败: ${details || '请检查远程目录是否存在'}`)
      }

      console.log(chalk.cyan(`已在远程目录 ${targetDir} 创建测试文件 ${testFile}`))

      const confirmed = await confirm({
        message: `请在服务器确认 ${remoteFile} 是否存在，确认无误请输入 Y 继续`,
        default: true,
      }, { clearPromptOnDone: true })

      const cleanupResult = await ssh.execCommand(`rm -f "${remoteFile}"`)
      if (cleanupResult instanceof Error) {
        const errorResult = cleanupResult as CommandError
        const details = errorResult.stderr || errorResult.stdout || errorResult.message
        throw new Error(`删除测试文件失败: ${details || '请手动清理远程 test 文件'}`)
      }

      console.log(chalk.gray(`已移除远程测试文件 ${remoteFile}`))

      if (confirmed) {
        break
      }

      console.log(chalk.yellow('未确认目录，请重新选择操作。'))
    }
  }

  /* 1.渲染模式 */
  options.render = await select({
    message: '请选择渲染模式',
    choices: [
      { name: '服务端渲染：SSR', value: 'ssr' },
      { name: '预渲染生成：SSG', value: 'ssg' },
    ],
  }, { clearPromptOnDone: true })

  /* 1.SSR */
  if (options.render === 'ssr') {
    const pm2ls = await ssh.execCommand('pm2 jlist')

    if (pm2ls instanceof Error) {
      const errorResult = pm2ls as CommandError
      const details = errorResult.stderr || errorResult.stdout || errorResult.message
      throw new Error(`未能获取 PM2 列表: ${details || '未知错误'}`)
    }

    const rawOutput = pm2ls.stdout?.trim()
    if (!rawOutput) {
      throw new Error('未能获取 PM2 列表: 输出为空')
    }

    let pm2List
    try {
      pm2List = JSON.parse(rawOutput)
    }
    catch (error) {
      throw new Error(`PM2 列表解析失败: ${(error as Error).message}`)
    }

    const processes = Array.isArray(pm2List)
      ? pm2List
          .map(proc => ({ name: proc.name, value: proc.pm_id }))
          .filter(proc => typeof proc.name === 'string' && proc.name.startsWith('web-'))
      : []

    if (!processes.length) {
      throw new Error('未找到以 web- 开头的 PM2 应用，无法继续重启流程')
    }

    options.pm2id = await select({ message: '选择PM2应用名称！用于重启', choices: processes }, { clearPromptOnDone: true })
  }

  /* 2.是否打包 */
  options.rebuild = await confirm({ message: '是否重新打包？' }, { clearPromptOnDone: true })

  return options
}

/* 确认操作 */
export async function confirmChoices(choices) {
  console.info(`${chalk.magentaBright('请确认，以下配置信息:')}`)
  printSeparator(48)
  for (const [key, value] of Object.entries(choices)) {
    console.info(`- ${key}: ${value}`)
  }
  const confirmed = await confirm({
    message: '是否正确并继续?',
    default: true,
  }, { clearPromptOnDone: true })
  return confirmed
}
