export function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function joinRemotePath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0)
        return part.replace(/\/+$/, '')
      return part.replace(/^\/+|\/+$/g, '')
    })
    .join('/')
}

export function commandWithEnv(command: string, envInit: string[]): string {
  const init = envInit.filter(item => item.trim())
  return init.length ? `${init.join(' && ')} && ${command}` : command
}
