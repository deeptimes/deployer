#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runCLI } from './cli/index'

export { runCLI }
export type * from './types/index'

const entryFile = realpathSync(fileURLToPath(import.meta.url))
const calledFile = process.argv[1] ? realpathSync(process.argv[1]) : ''

if (calledFile === entryFile) {
  runCLI().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
