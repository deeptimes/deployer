import type { RemoteClient } from '../ssh/RemoteClient'
import type { EffectiveProfile } from '../types/nuxter'

import { quoteShell } from '../utils/shell'
import { paths } from './releases'

export async function runDoctor(remote: RemoteClient, profile: EffectiveProfile, mode: 'full' | 'light' = 'full'): Promise<void> {
  const p = paths(profile)
  console.log(`预检: ${profile.name} -> ${profile.ssh.host}`)

  await remote.mustExec('command -v tar', '检查 tar')
  await remote.mustExec(`mkdir -p ${quoteShell(p.root)} && test -w ${quoteShell(p.root)}`, '检查远程根目录')
  await remote.mustExec(`mkdir -p ${quoteShell(p.bak)} && test -w ${quoteShell(p.bak)}`, '检查远程备份目录')

  if (profile.process.type === 'pm2') {
    await checkRemoteCommand(remote, 'pm2', '检查 PM2', 'SSH 非交互环境找不到 pm2，请确认 envInit 已加载 /etc/profile 或 nvm')
    await checkPm2Process(remote, profile)
  }

  if (profile.webServer.type === 'nginx') {
    await remote.mustExec('command -v nginx', '检查 Nginx')
    if (mode === 'full')
      await resolveNginxOwner(remote, profile)
  }

  console.log('预检通过')
}

async function checkRemoteCommand(remote: RemoteClient, command: string, label: string, hint: string): Promise<void> {
  const result = await remote.exec(`command -v ${quoteShell(command)}`)
  if (result.code !== 0) {
    const details = result.stderr || result.stdout || `exit code ${result.code}`
    throw new Error(`${label} 失败: ${details}。${hint}`)
  }
}

async function checkPm2Process(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  const result = await remote.mustExec('pm2 jlist', '读取 PM2 应用列表')
  const list = JSON.parse(result.stdout) as Array<{ name?: string }>
  const matches = list.filter(item => item.name === profile.process.name)

  if (matches.length > 1)
    throw new Error(`PM2 应用名不唯一: ${profile.process.name}，请先清理重复进程`)

  if (!matches.length)
    console.log(`PM2 应用 ${profile.process.name} 不存在，部署时将自动创建`)
}

export async function resolveNginxOwner(remote: RemoteClient, profile: EffectiveProfile): Promise<{ owner: string, group: string }> {
  if (profile.webServer.owner !== 'auto' && profile.webServer.group !== 'auto') {
    return {
      owner: profile.webServer.owner,
      group: profile.webServer.group,
    }
  }

  const fromConfig = await remote.exec(`nginx -T 2>/dev/null | awk '/^user / {print $2, $3; exit}' | sed 's/;//g'`)
  const [configOwner, configGroup] = fromConfig.stdout.split(/\s+/).filter(Boolean)
  if (configOwner) {
    return {
      owner: profile.webServer.owner === 'auto' ? configOwner : profile.webServer.owner,
      group: profile.webServer.group === 'auto' ? configGroup || configOwner : profile.webServer.group,
    }
  }

  const fromProcess = await remote.exec(`ps -eo user,comm | awk '$2 ~ /nginx/ && $1 != "root" {print $1; exit}'`)
  if (fromProcess.stdout) {
    const user = fromProcess.stdout.trim()
    return {
      owner: profile.webServer.owner === 'auto' ? user : profile.webServer.owner,
      group: profile.webServer.group === 'auto' ? user : profile.webServer.group,
    }
  }

  const fallback = await remote.exec(`for user in www-data www nginx; do id "$user" >/dev/null 2>&1 && echo "$user" && exit 0; done`)
  if (fallback.stdout) {
    const user = fallback.stdout.trim()
    return {
      owner: profile.webServer.owner === 'auto' ? user : profile.webServer.owner,
      group: profile.webServer.group === 'auto' ? user : profile.webServer.group,
    }
  }

  throw new Error('无法自动识别 Nginx owner/group，请在 profile.webServer 中显式配置 owner 和 group')
}
