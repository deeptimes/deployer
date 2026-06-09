import type { RemoteClient } from '../ssh/RemoteClient'

export interface Pm2ProcessInfo {
  name?: string
}

export async function listPm2Processes(remote: RemoteClient, processName: string): Promise<Pm2ProcessInfo[]> {
  const result = await remote.mustExec('pm2 jlist', '读取 PM2 应用列表')
  const list = parsePm2Jlist(result.stdout)
  return list.filter(item => item.name === processName)
}

function parsePm2Jlist(stdout: string): Pm2ProcessInfo[] {
  const raw = stdout.trim()

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed))
      return parsed as Pm2ProcessInfo[]
  }
  catch {}

  const parsed = parseJsonArrayFromMixedOutput(raw)
  if (parsed)
    return parsed as Pm2ProcessInfo[]

  const preview = raw.slice(0, 120) || '输出为空'
  throw new Error(`PM2 应用列表解析失败: ${preview}`)
}

function parseJsonArrayFromMixedOutput(output: string): unknown[] | undefined {
  const starts = indexesOf(output, '[')
  const ends = indexesOf(output, ']').reverse()

  for (const start of starts) {
    for (const end of ends) {
      if (end <= start)
        continue

      try {
        const parsed = JSON.parse(output.slice(start, end + 1))
        if (Array.isArray(parsed))
          return parsed
      }
      catch {}
    }
  }
}

function indexesOf(value: string, char: string): number[] {
  const indexes: number[] = []
  for (let index = value.indexOf(char); index !== -1; index = value.indexOf(char, index + 1))
    indexes.push(index)
  return indexes
}
