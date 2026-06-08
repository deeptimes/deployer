import type { EffectiveProfile } from '../types/nuxter'

import { mkdir, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

export async function createArchive(profile: EffectiveProfile): Promise<{ file: string, size: number }> {
  const tmpDir = resolve(profile.projectRoot, '.nuxter/tmp')
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })

  const archiveFile = resolve(tmpDir, profile.build.archive)
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
