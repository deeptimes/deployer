import type { EffectiveProfile } from '../types/nuxter'

import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

export async function createArchive(profile: EffectiveProfile, releaseId: string): Promise<{ file: string, size: number }> {
  const tmpDir = resolve(profile.projectRoot, '.nuxter/tmp')
  await mkdir(tmpDir, { recursive: true })

  const archiveFile = resolve(tmpDir, `${releaseId}.tar.gz`)
  const args = [
    '-czf',
    archiveFile,
    ...profile.build.excludes.flatMap(pattern => ['--exclude', pattern]),
    '-C',
    resolve(profile.projectRoot, profile.build.output),
    '.',
  ]

  await execa('tar', args, {
    cwd: profile.projectRoot,
    env: {
      ...process.env,
      COPYFILE_DISABLE: '1',
    },
  })

  const stats = await stat(archiveFile)
  return { file: archiveFile, size: stats.size }
}
