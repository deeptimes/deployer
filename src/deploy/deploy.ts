import type { CLIOptions, EffectiveProfile } from '../types/nuxter'

import { createArchive } from '../archive/tar'
import { assertOutputReady, runBuild } from '../build/runner'
import { resolveNginxOwner, runDoctor } from '../remote/doctor'
import { backupCurrentDist, cleanupBackups, cleanupRemoteTemp, ensureRemoteLayout, paths, replaceDist, stageArchive } from '../remote/releases'
import { RemoteClient } from '../ssh/RemoteClient'
import { joinRemotePath, quoteShell } from '../utils/shell'

export async function deployProfile(profile: EffectiveProfile, options: CLIOptions): Promise<void> {
  const deployId = createDeployId(profile)
  const remote = new RemoteClient(profile)

  console.log(`部署包: ${deployId}`)
  if (options.dryRun) {
    printDeployPlan(profile, deployId)
    return
  }

  try {
    await remote.connect()
    await runDoctor(remote, profile, 'light')

    if (options.noBuild)
      await assertOutputReady(profile)
    else
      await runBuild(profile)

    const archive = await createArchive(profile)
    const p = paths(profile)

    await ensureRemoteLayout(remote, profile)
    await cleanupRemoteTemp(remote, profile)
    console.log(`上传: ${p.remoteArchive}`)
    await remote.upload(archive.file, p.remoteArchive)

    const stagePath = await stageArchive(remote, profile, p.remoteArchive)

    const owner = await resolveNginxOwner(remote, profile)
    await remote.mustExec(`chown -R ${quoteShell(`${owner.owner}:${owner.group}`)} ${quoteShell(stagePath)}`, '设置 owner/group')
    await remote.mustExec(`find ${quoteShell(stagePath)} -type d -exec chmod 755 {} \\; && find ${quoteShell(stagePath)} -type f -exec chmod 644 {} \\;`, '设置文件权限')

    await backupCurrentDist(remote, profile, deployId)
    await replaceDist(remote, profile, stagePath)
    await reloadServices(remote, profile)
    await cleanupRemoteTemp(remote, profile)
    await cleanupBackups(remote, profile)

    console.log(`部署完成: ${profile.name} -> ${deployId}`)
  }
  finally {
    remote.close()
  }
}

export async function reloadServices(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  if (profile.process.type === 'pm2' && profile.process.name) {
    await reloadOrStartPm2(remote, profile)
  }

  if (profile.webServer.type === 'nginx') {
    await remote.mustExec(profile.webServer.reloadCommand, 'Nginx reload')
  }
}

async function reloadOrStartPm2(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  const processName = profile.process.name!
  const processes = await listPm2Processes(remote, processName)

  if (processes.length > 1) {
    throw new Error(`PM2 应用名不唯一: ${processName}，请先清理重复进程`)
  }

  if (!processes.length) {
    const entry = joinRemotePath(paths(profile).dist, 'server/index.mjs')
    await remote.mustExec(`test -f ${quoteShell(entry)}`, `检查 PM2 入口 ${entry}`)
    await remote.mustExec(`pm2 start ${quoteShell(entry)} --name ${quoteShell(processName)}`, `PM2 start ${processName}`)
    return
  }

  await remote.mustExec(`pm2 ${profile.process.action} ${quoteShell(processName)}`, `PM2 ${profile.process.action}`)
}

async function listPm2Processes(remote: RemoteClient, processName: string): Promise<unknown[]> {
  const result = await remote.mustExec('pm2 jlist', '读取 PM2 应用列表')
  const list = JSON.parse(result.stdout) as Array<{ name?: string }>
  return list.filter(item => item.name === processName)
}

function printDeployPlan(profile: EffectiveProfile, deployId: string): void {
  const p = paths(profile)
  console.log(`profile: ${profile.name}`)
  console.log(`host: ${profile.ssh.host}`)
  console.log(`remote root: ${profile.remote.root}`)
  console.log(`dist: ${p.dist}`)
  console.log(`local archive: .nuxter/tmp/${profile.build.archive}`)
  console.log(`remote archive: ${p.remoteArchive}`)
  console.log(`staging: ${p.staging}`)
  console.log(`backup: ${joinRemotePath(p.bak, `${deployId}.tar.gz`)}`)
  console.log(`build: ${profile.build.command}`)
  console.log(`output: ${profile.build.output}`)
  console.log(`process: ${profile.process.type}${profile.process.name ? `:${profile.process.name}` : ''}`)
  console.log(`web: ${profile.webServer.type}`)
}

function createDeployId(profile: EffectiveProfile): string {
  const now = new Date()
  const date = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const safeProfileName = profile.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'default'
  return `${safeProfileName}-${date}-${time}`
}
