import type { RemoteClient } from '../ssh/RemoteClient'
import type { BackupInfo, EffectiveProfile } from '../types/nuxter'

import { joinRemotePath, quoteShell } from '../utils/shell'

export function paths(profile: EffectiveProfile) {
  const root = profile.remote.root
  const nuxter = joinRemotePath(root, profile.remote.nuxterDir)
  return {
    root,
    dist: joinRemotePath(root, profile.remote.distDir),
    bak: joinRemotePath(root, profile.remote.bakDir),
    logs: joinRemotePath(root, profile.remote.logsDir),
    nuxter,
    uploads: joinRemotePath(nuxter, profile.remote.uploadsDir),
    staging: joinRemotePath(nuxter, profile.remote.stagingDir),
  }
}

export async function ensureRemoteLayout(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  const p = paths(profile)
  await remote.mustExec(`mkdir -p ${quoteShell(p.bak)} ${quoteShell(p.uploads)} ${quoteShell(p.staging)} ${quoteShell(p.logs)}`, '创建远程目录')
}

export async function listRemoteBackups(remote: RemoteClient, profile: EffectiveProfile): Promise<BackupInfo[]> {
  const p = paths(profile)
  const result = await remote.mustExec(
    `cd ${quoteShell(p.bak)} && ls -1t *.tar.gz 2>/dev/null || true`,
    '读取备份版本列表',
  )

  return result.stdout
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
    .map(file => ({ file, id: file.replace(/\.tar\.gz$/, '') }))
}

export async function stageArchive(remote: RemoteClient, profile: EffectiveProfile, archivePath: string, stageId: string): Promise<string> {
  const p = paths(profile)
  const stagePath = joinRemotePath(p.staging, stageId)
  await remote.mustExec(`rm -rf ${quoteShell(stagePath)} && mkdir -p ${quoteShell(stagePath)}`, '准备 staging 目录')
  await remote.mustExec(`tar -xzf ${quoteShell(archivePath)} -C ${quoteShell(stagePath)} --warning=no-unknown-keyword`, '解压到 staging')
  return stagePath
}

export async function replaceDist(remote: RemoteClient, profile: EffectiveProfile, stagePath: string, operationId: string): Promise<void> {
  const p = paths(profile)
  const previousPath = joinRemotePath(p.staging, `previous-${operationId}`)
  await remote.mustExec(
    [
      `rm -rf ${quoteShell(previousPath)}`,
      `if [ -e ${quoteShell(p.dist)} ]; then mv ${quoteShell(p.dist)} ${quoteShell(previousPath)}; fi`,
      `if mv ${quoteShell(stagePath)} ${quoteShell(p.dist)}; then rm -rf ${quoteShell(previousPath)}; else if [ -e ${quoteShell(previousPath)} ]; then mv ${quoteShell(previousPath)} ${quoteShell(p.dist)}; fi; exit 1; fi`,
    ].join(' && '),
    '替换 dist',
  )
}

export async function backupCurrentDist(remote: RemoteClient, profile: EffectiveProfile, backupId: string): Promise<void> {
  const p = paths(profile)
  const backupFile = joinRemotePath(p.bak, `${backupId}.tar.gz`)
  await remote.mustExec(
    `if [ -d ${quoteShell(p.dist)} ]; then tar -czf ${quoteShell(backupFile)} -C ${quoteShell(p.dist)} .; fi`,
    '备份当前 dist',
  )
}

export async function cleanupBackups(remote: RemoteClient, profile: EffectiveProfile): Promise<void> {
  const retain = profile.retain.backups
  if (retain <= 0)
    return
  const p = paths(profile)
  await remote.mustExec(
    `cd ${quoteShell(p.bak)} && ls -1t *.tar.gz 2>/dev/null | tail -n +${retain + 1} | xargs -r rm -f`,
    '清理历史备份',
  )
}
