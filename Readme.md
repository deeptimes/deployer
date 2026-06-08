# Nuxter

Nuxter 是一个面向 Nuxt 项目的本地全局部署工具，用于在本机完成构建，然后通过 SSH 发布到自己的服务器。

当前 2.0 版本的核心约定：

- 命令入口：`nuxter`
- 配置文件：项目根目录 `.nuxter/config.json`
- 部署环境：通过 profile 区分，例如 `test`、`staging`、`prod`
- 服务器线上目录：`dist`，保持为实体目录
- 历史版本：保存在 `bak/*.tar.gz`
- 部署中转：使用 `.nuxter/uploads` 和 `.nuxter/staging`

旧命令 `nuxt-deployer` 仍作为兼容别名保留。

## 安装

推荐全局安装：

```bash
pnpm add -g @deeptimes/deployer
```

安装后检查版本：

```bash
nuxter --version
```

预期输出：

```text
2.0.0
```

## 服务器目录约定

假设站点目录为：

```text
/www/web/www.test.com
```

Nuxter 预期服务器目录结构为：

```text
/www/web/www.test.com/
  dist/                 # 当前线上实体目录
  bak/                  # 历史版本压缩包
  logs/                 # PM2 日志目录，保留你的现有约定
  .nuxter/
    uploads/            # 临时上传包
    staging/            # 部署和回滚的解压中转目录
    deploy.json         # 最近一次部署元数据
```

说明：

- `dist` 不会被改成软链接。
- `bak` 中保存的是 `.tar.gz`，不是展开后的目录。
- `.nuxter/uploads` 只在部署过程中临时存放上传包。
- `.nuxter/staging` 用于先解压、检查、设置权限，再替换 `dist`。

## 初始化配置

在 Nuxt 项目根目录运行：

```bash
nuxter init
```

预期过程：

```text
1. 读取当前 package.json
2. 自动识别包管理器
3. 询问项目名称
4. 选择构建模式：SSR / Static / Custom
5. 从当前 `package.json` 的 `scripts` 中选择构建命令，或输入自定义命令
6. 填写 SSH 信息
7. 填写服务器远程根目录
8. SSR 模式下填写 PM2 应用名
9. 生成 .nuxter/config.json
```

构建命令选择会优先展示：

```text
build
build:*
generate
ssg
其他 scripts
自定义命令
```

例如当前项目包含：

```json
{
  "scripts": {
    "build": "nuxt build --dotenv .env.production",
    "build:test": "nuxt build --dotenv .env.test",
    "ssg": "nuxt generate"
  }
}
```

初始化时会显示类似：

```text
build       -> nuxt build --dotenv .env.production
build:test  -> nuxt build --dotenv .env.test
ssg         -> nuxt generate
自定义命令
```

选中 `build:test` 后，写入配置的命令为：

```text
pnpm run build:test
```

带默认值的输入项，例如：

```text
项目名称 (nuxt-app)
构建输出目录 (.output)
```

括号里的内容是默认值，不是已经输入的文本。直接回车会使用默认值；如果输入后又删除为空，再回车也会使用默认值。

生成的配置示例：

```json
{
  "version": 1,
  "project": {
    "name": "www-test",
    "packageManager": "pnpm"
  },
  "profiles": {
    "prod": {
      "ssh": {
        "host": "example.com",
        "port": 22,
        "username": "root",
        "privateKey": "~/.ssh/id_rsa",
        "readyTimeout": 20000
      },
      "remote": {
        "root": "/www/web/www.test.com",
        "distDir": "dist",
        "bakDir": "bak",
        "logsDir": "logs",
        "nuxterDir": ".nuxter",
        "uploadsDir": "uploads",
        "stagingDir": "staging"
      },
      "build": {
        "mode": "ssr",
        "command": "pnpm run build",
        "output": ".output",
        "archive": "dist.tar.gz",
        "excludes": [".DS_Store", "._*", "__MACOSX"]
      },
      "process": {
        "type": "pm2",
        "name": "web-www-test",
        "action": "reload"
      },
      "webServer": {
        "type": "nginx",
        "reloadCommand": "nginx -s reload",
        "owner": "auto",
        "group": "auto"
      },
      "retain": {
        "backups": 5
      }
    }
  }
}
```

## 查看 profiles

```bash
nuxter profiles
```

预期结果：

```text
test
staging
prod
```

如果没有 `.nuxter/config.json`，会提示先运行 `nuxter init`。

## 预检服务器

```bash
nuxter doctor prod
```

预期过程：

```text
1. 读取 prod profile
2. 校验 SSH、remote、build、process、webServer 配置
3. 连接服务器
4. 检查 tar 命令
5. 检查 remote.root 是否可写
6. 创建并检查 bak、.nuxter/uploads、.nuxter/staging、logs
7. SSR + PM2 模式下检查 PM2 和应用名
8. Nginx 模式下检查 nginx 命令
9. owner/group 为 auto 时尝试识别 Nginx 用户和组
```

成功时预期输出：

```text
预检: prod -> example.com
预检通过
```

失败时会输出失败阶段，例如 SSH 连接失败、远程目录不可写、PM2 应用不存在、Nginx owner/group 无法识别。

## 模拟部署

```bash
nuxter deploy prod --dry-run
```

预期结果：

```text
发布版本: 20260608-153000-a1b2c3
profile: prod
host: example.com
remote root: /www/web/www.test.com
dist: /www/web/www.test.com/dist
staging: /www/web/www.test.com/.nuxter/staging/20260608-153000-a1b2c3
upload: /www/web/www.test.com/.nuxter/uploads/20260608-153000-a1b2c3.tar.gz
backup: /www/web/www.test.com/bak/20260608-153000-a1b2c3.tar.gz
build: pnpm run build
output: .output
process: pm2:web-www-test
web: nginx
```

说明：

- `--dry-run` 只展示计划。
- 不连接服务器。
- 不执行 build。
- 不上传文件。
- 不修改远程目录。

## 正式部署

```bash
nuxter deploy prod
```

默认会展示部署计划并要求确认。

跳过确认：

```bash
nuxter deploy prod --yes
```

不重新 build，直接使用已有输出目录：

```bash
nuxter deploy prod --no-build
```

正式部署预期过程：

```text
1. 读取 prod profile
2. 生成 releaseId
3. 展示部署计划并确认
4. SSH 连接服务器
5. 执行轻量预检
6. 本地执行 build.command
7. 校验 build.output 存在且非空
8. 本地打包 build.output 到 .nuxter/tmp/<releaseId>.tar.gz
9. 上传到服务器 .nuxter/uploads/<releaseId>.tar.gz
10. 解压到服务器 .nuxter/staging/<releaseId>/
11. 对 staging 设置 owner/group 和权限
12. 将当前 dist 打包为 bak/pre-<releaseId>.tar.gz
13. 用 staging/<releaseId> 替换 dist
14. 执行 PM2 reload/restart
15. 执行 Nginx reload
16. 将上传包移动为 bak/<releaseId>.tar.gz
17. 写入 .nuxter/deploy.json
18. 清理超出保留数量的 bak/*.tar.gz
```

关键保障：

- 解压失败不会影响当前 `dist`。
- 权限设置失败不会影响当前 `dist`。
- 替换 `dist` 前会先备份当前 `dist`。
- `dist` 始终是实体目录，不是软链接。

## 查看可回滚版本

```bash
nuxter releases prod
```

实际读取：

```text
/www/web/www.test.com/bak/*.tar.gz
```

预期输出：

```text
20260608-153000-a1b2c3
pre-20260608-153000-a1b2c3
20260607-221000-c9d8e7
```

说明：

- 输出值不包含 `.tar.gz` 后缀。
- `pre-*` 是部署或回滚前自动备份的旧 `dist`。

## 回滚

交互式选择版本：

```bash
nuxter rollback prod
```

指定版本：

```bash
nuxter rollback prod --target 20260607-221000-c9d8e7
```

预期过程：

```text
1. SSH 连接服务器
2. 读取 bak/*.tar.gz
3. 选择或使用 --target 指定版本
4. 解压目标包到 .nuxter/staging/rollback-<target>/
5. 将当前 dist 打包为 bak/pre-rollback-<target>.tar.gz
6. 用 staging 目录替换 dist
7. 执行 PM2 reload/restart
8. 执行 Nginx reload
9. 输出回滚完成
```

回滚不依赖本地构建产物，也不会重新 build。

## 构建模式

### SSR

适用于 Nuxt SSR / Nitro node-server。

典型配置：

```json
{
  "build": {
    "mode": "ssr",
    "command": "pnpm run build",
    "output": ".output"
  },
  "process": {
    "type": "pm2",
    "name": "web-www-test",
    "action": "reload"
  }
}
```

部署后会执行 PM2 和 Nginx reload。

### Static

适用于 SSG、SPA 或纯静态输出。

典型配置：

```json
{
  "build": {
    "mode": "static",
    "command": "pnpm run generate",
    "output": ".output/public"
  },
  "process": {
    "type": "none"
  }
}
```

部署后默认只执行 Nginx reload。

### Custom

适用于自定义构建命令和服务策略。Nuxter 只按配置执行，不自动推断。

## 全局配置

可选全局配置路径：

```text
~/.nuxter/config.json
```

适合保存复用 SSH identity：

```json
{
  "version": 1,
  "identities": {
    "default-vps": {
      "username": "root",
      "privateKey": "~/.ssh/id_rsa"
    }
  }
}
```

项目 profile 中引用：

```json
{
  "ssh": {
    "identity": "default-vps",
    "host": "example.com"
  }
}
```

注意：不要把私钥内容、密码、sudo 密码写入项目配置。
