import type { EffectiveProfile } from '../types/nuxter'

import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execa } from 'execa'

export async function runBuild(profile: EffectiveProfile): Promise<void> {
  console.log(`构建: ${profile.build.command}`)
  await execa(profile.build.command, {
    cwd: profile.projectRoot,
    shell: true,
    stdio: 'inherit',
  })
  await assertOutputReady(profile)
}

export async function assertOutputReady(profile: EffectiveProfile): Promise<void> {
  const outputPath = resolve(profile.projectRoot, profile.build.output)
  if (!existsSync(outputPath))
    throw new Error(`构建输出目录不存在: ${profile.build.output}`)

  const stats = await stat(outputPath)
  if (!stats.isDirectory())
    throw new Error(`构建输出不是目录: ${profile.build.output}`)

  const files = await readdir(outputPath)
  if (!files.length)
    throw new Error(`构建输出目录为空: ${profile.build.output}`)
}
