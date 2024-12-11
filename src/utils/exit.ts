import process from 'node:process'
import readline from 'node:readline'

export function setupExitHandlers() {
  // 设置键盘事件监听
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  // 处理 Esc 键
  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'escape') {
      gracefulExit('ESC')
    }
    // 处理 Ctrl+C
    if (key.ctrl && key.name === 'c') {
      gracefulExit('Ctrl+C')
    }
  })

  // 处理 SIGINT 信号 (Ctrl+C)
  process.on('SIGINT', () => {
    gracefulExit('Ctrl+C')
  })

  // 处理 SIGTERM 信号
  process.on('SIGTERM', () => {
    gracefulExit('SIGTERM')
  })
}

// 优雅退出函数
function gracefulExit(signal: string) {
  console.log(`\n收到 ${signal} 信号，正在退出交互...`)

  // 恢复终端设置
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  // 这里可以添加清理工作
  // 比如关闭数据库连接
  // 保存未保存的数据等

  process.exit(0)
}
