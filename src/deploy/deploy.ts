import type { CLIOptions, EffectiveProfile } from '../types/nuxter'

import { execa } from 'execa'
import { createArchive } from '../archive/tar'
import { assertOutputReady, runBuild } from '../build/runner'
import { resolveNginxOwner, runDoctor } from '../remote/doctor'
import { backupCurrentDist, cleanupBackups, ensureRemoteLayout, paths, replaceDist, stageArchive } from '../remote/releases'
import { RemoteClient } from '../ssh/RemoteClient'
import { joinRemotePath, quoteShell } from '../utils/shell'

export async function deployProfile(profile: EffectiveProfile, options: CLIOptions): Promise<void> {
  const releaseId = await createReleaseId(profile.projectRoot)
  const remote = new RemoteClient(profile)

  console.log(`发布版本: ${releaseId}`)
  if (options.dryRun) {
    printDeployPlan(profile, releaseId)
    return
  }

  try {
    await remote.connect()
    await runDoctor(remote, profile, 'light')

    if (options.noBuild)
      await assertOutputReady(profile)
    else
      await runBuild(profile)

    const archive = await createArchive(profile, releaseId)
    const p = paths(profile)
    const remoteArchive = joinRemotePath(p.uploads, `${releaseId}.tar.gz`)
    const backupArchive = joinRemotePath(p.bak, `${releaseId}.tar.gz`)

    await ensureRemoteLayout(remote, profile)
    console.log(`上传: ${remoteArchive}`)
    await remote.upload(archive.file, remoteArchive)

    const stagePath = await stageArchive(remote, profile, remoteArchive, releaseId)

    const owner = await resolveNginxOwner(remote, profile)
    await remote.mustExec(`chown -R ${quoteShell(`${owner.owner}:${owner.group}`)} ${quoteShell(stagePath)}`, '设置 owner/group')
    await remote.mustExec(`find ${quoteShell(stagePath)} -type d -exec chmod 755 {} \\; && find ${quoteShell(stagePath)} -type f -exec chmod 644 {} \\;`, '设置文件权限')

    await backupCurrentDist(remote, profile, `pre-${releaseId}`)
    await replaceDist(remote, profile, stagePath, releaseId)
    await reloadServices(remote, profile)
    await writeMetadata(remote, profile, releaseId)
    await remote.mustExec(`mv ${quoteShell(remoteArchive)} ${quoteShell(backupArchive)} && touch ${quoteShell(backupArchive)}`, '保存本次备份包')
    await cleanupBackups(remote, profile)

    console.log(`部署完成: ${profile.name} -> ${releaseId}`)
  }
  finally {
    remote.close()
  }
}

export async function reloadServices(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  if (profile.process.type === 'pm2' && profile.process.name) {
    await remote.mustExec(`pm2 ${profile.process.action} ${quoteShell(profile.process.name)}`, `PM2 ${profile.process.action}`)
  }

  if (profile.webServer.type === 'nginx') {
    await remote.mustExec(profile.webServer.reloadCommand, 'Nginx reload')
  }
}

function printDeployPlan(profile: EffectiveProfile, releaseId: string): void {
  const p = paths(profile)
  console.log(`profile: ${profile.name}`)
  console.log(`host: ${profile.ssh.host}`)
  console.log(`remote root: ${profile.remote.root}`)
  console.log(`dist: ${p.dist}`)
  console.log(`staging: ${joinRemotePath(p.staging, releaseId)}`)
  console.log(`upload: ${joinRemotePath(p.uploads, `${releaseId}.tar.gz`)}`)
  console.log(`backup: ${joinRemotePath(p.bak, `${releaseId}.tar.gz`)}`)
  console.log(`build: ${profile.build.command}`)
  console.log(`output: ${profile.build.output}`)
  console.log(`process: ${profile.process.type}${profile.process.name ? `:${profile.process.name}` : ''}`)
  console.log(`web: ${profile.webServer.type}`)
}

async function writeMetadata(remote: RemoteClient, profile: EffectiveProfile, releaseId: string): Promise<void> {
  const p = paths(profile)
  const metadata = JSON.stringify({
    releaseId,
    profile: profile.name,
    project: profile.projectName,
    build: profile.build.command,
    mode: profile.build.mode,
    deployedAt: new Date().toISOString(),
  })
  await remote.mustExec(`printf %s ${quoteShell(metadata)} > ${quoteShell(joinRemotePath(p.nuxter, 'deploy.json'))}`, '写入部署元数据')
}

async function createReleaseId(projectRoot: string): Promise<string> {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const timestamp = `${date}-${time}`

  try {
    const result = await execa('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot })
    return `${timestamp}-${result.stdout.trim()}`
  }
  catch {
    return `${timestamp}-local`
  }
}
