import type { DeployToolConfig } from './types'

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const CONFIG_FILES = [
  'deploy.config.ts',
  'deploy.config.js',
]

export async function loadConfig(): Promise<DeployToolConfig> {
  const cwd = process.cwd()
  let configPath: string | null = null

  for (const file of CONFIG_FILES) {
    const fullPath = resolve(cwd, file)
    if (existsSync(fullPath)) {
      configPath = fullPath
      break
    }
  }

  if (!configPath) {
    throw new Error('请在项目根目录创建 deploy.config.js')
  }

  try {
    const config = await import(configPath)

    /* 读取目标项目的 Package.json */
    const pkgData = readFileSync(resolve(cwd, 'package.json'), 'utf-8')
    const pkgJson = JSON.parse(pkgData)

    const defaultConfig: DeployToolConfig = {
      ssh: {
        host: 'localhost',
        port: 22,
        username: 'root',
        privateKey: '~/.ssh/id_rsa',
        readyTimeout: 20000,
      },
      temp: 'temp',
      output: '.output',
      dist: 'dist.tar.gz',
      excludes: ['.DS_Store', '._.DS_Store'],
      package: pkgJson,
      remote: {
        root: '/www/web',
        site: 'www_test_com',
      },
    }

    return {
      ...defaultConfig,
      ...config.default || config,
    }
  }
  catch (error) {
    throw new Error(`配置文件加载失败: ${error.message}`)
  }
}
