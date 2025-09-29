import type { CommandError, DeployToolConfig, Options } from './types'
import confirm from '@inquirer/confirm'
import select from '@inquirer/select'
import chalk from 'chalk'
import { printSeparator } from './utils/helper'

export async function getOptions(ssh, config: DeployToolConfig): Promise<Options> {
  const options = {} as Options

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
