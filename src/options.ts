import type { DeployToolConfig, Options } from './types'
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
    // 找到`web`开头的`pm2`应用
    const processes = JSON.parse(pm2ls.stdout)
      .map(proc => ({ name: proc.name, value: proc.pm_id }))
      .filter(proc => proc.name.startsWith('web-'))

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
