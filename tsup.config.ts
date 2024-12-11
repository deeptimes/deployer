import { chmod } from 'node:fs/promises'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'], // 入口文件
  format: ['esm'], // 只输出 ESM 格式
  dts: {
    entry: {
      index: 'src/types/index.ts', // 显式指定类型入口
    },
    resolve: true,
  },
  splitting: false, // 启用代码分割
  sourcemap: true, // 生成 sourcemap
  clean: true, // 每次构建前清理
  target: 'es2020', // 目标版本
  minify: false, // 不压缩代码
  outDir: 'dist', // 输出目录
  treeshake: true, // 启用 tree shaking
  async onSuccess() {
    // 设置可执行权限
    await chmod('dist/index.js', '755')
    console.log('✨ Added executable permission to dist/index.js')
  },
})
