import type { SSHConfig } from './ssh'

// export interface Config {
//   root: string
//   site: string
//   tempDir: string
//   distDir: string
//   distFile: string
// }

export interface Package {
  name?: string
  version?: string
}

type Render = 'ssr' | 'ssg'

export interface Options {
  render: Render
  pm2id: number
  rebuild: boolean
  app: string
  remotePath: string
  remoteFile: string
}

export interface DeployToolConfig {
  temp: string
  output: string
  dist: string
  excludes: string[]
  package: Package
  ssh: SSHConfig
  remote: {
    root: string
    site: string
  }
}
