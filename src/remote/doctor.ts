import type { RemoteClient } from '../ssh/RemoteClient'
import type { EffectiveProfile } from '../types/nuxter'

import { quoteShell } from '../utils/shell'
import { paths } from './releases'

export async function runDoctor(remote: RemoteClient, profile: EffectiveProfile, mode: 'full' | 'light' = 'full'): Promise<void> {
  const p = paths(profile)
  console.log(`预检: ${profile.name} -> ${profile.ssh.host}`)

  await remote.mustExec('command -v tar', '检查 tar')
  await remote.mustExec(`mkdir -p ${quoteShell(p.root)} && test -w ${quoteShell(p.root)}`, '检查远程根目录')
  await remote.mustExec(`mkdir -p ${quoteShell(p.bak)} ${quoteShell(p.staging)} ${quoteShell(p.uploads)} && test -w ${quoteShell(p.bak)} && test -w ${quoteShell(p.staging)} && test -w ${quoteShell(p.uploads)}`, '检查远程工作目录')

  if (profile.process.type === 'pm2') {
    await remote.mustExec('command -v pm2', '检查 PM2')
    await remote.mustExec(`pm2 jlist | grep -F ${quoteShell(`"name":"${profile.process.name}"`)}`, `检查 PM2 应用 ${profile.process.name}`)
  }

  if (profile.webServer.type === 'nginx') {
    await remote.mustExec('command -v nginx', '检查 Nginx')
    if (mode === 'full')
      await resolveNginxOwner(remote, profile)
  }

  console.log('预检通过')
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
