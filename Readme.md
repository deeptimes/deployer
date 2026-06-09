# Nuxter

Nuxter 是一个面向 Nuxt 项目的本地全局部署工具，用于在本机完成构建，然后通过 SSH 发布到自己的服务器。

当前 2.0 版本的核心约定：

- 命令入口：`nuxter`
- 配置文件：项目根目录 `.nuxter/config.json`
- 部署环境：通过 profile 区分，初始化默认生成 `default`
- 服务器线上目录：`dist`，保持为实体目录
- 回滚备份：保存在 `bak/*.tar.gz`
- 部署中转：使用服务器 `/tmp` 下的固定临时文件，部署完成后自动清理

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
  bak/                  # 回滚用的历史 dist 压缩包
```

说明：

- `dist` 不会被改成软链接。
- `bak` 中保存的是替换前的旧 `dist` 压缩包，不保存本次新上传包。
- 上传包和 staging 目录位于服务器 `/tmp`，使用固定名称，每次部署前后都会清理。
- 项目服务器目录内不会创建 `.nuxter/uploads`、`.nuxter/staging` 或 `deploy.json`。

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
SSH private key path (~/.ssh/id_rsa)
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
    "default": {
      "ssh": {
        "host": "example.com",
        "privateKey": "~/.ssh/id_rsa"
      },
      "remote": {
        "root": "/www/web/www.test.com"
      },
      "build": {
        "mode": "ssr",
        "command": "pnpm run build"
      },
      "process": {
        "name": "web-www-test"
      }
    }
  }
}
```

未写入配置的基础默认值由工具内部提供：

- `envInit`: 自动尝试加载 `/etc/profile` 和 `~/.nvm/nvm.sh`
- `ssh.username`: `root`
- `ssh.port`: `22`
- `ssh.readyTimeout`: `20000`
- `remote.distDir`: `dist`
- `remote.bakDir`: `bak`
- `build.archive`: `dist.tar.gz`
- `build.output`: SSR/Custom 为 `.output`，Static 为 `.output/public`
- `build.excludes`: `.DS_Store`、`._*`、`__MACOSX`
- `process.type`: SSR 为 `pm2`，Static/Custom 为 `none`
- `process.action`: `reload`
- `webServer.type`: `nginx`
- `webServer.reloadCommand`: `nginx -s reload`
- `webServer.owner/group`: `auto`
- `retain.backups`: `5`

## 部署用户模型

nuxter v2 当前围绕 root SSH 部署设计。`ssh.username` 默认就是 `root`，初始化配置不会再写入该字段。

```json
"ssh": {
  "host": "example.com",
  "privateKey": "~/.ssh/id_rsa"
}
```

原因是部署流程会管理远程目录、设置 owner/group、reload Nginx，并维护 root 用户下的 PM2 应用。普通用户部署需要额外 sudoers、目录 owner 和 PM2 用户隔离配置，当前不作为默认工作流。

## 远程环境初始化

远程命令会先执行 `envInit`，默认会尝试加载 `/etc/profile` 和 `~/.nvm/nvm.sh`，用于兼容通过 nvm 安装的 Node.js/PM2。默认初始化命令带有兜底逻辑，即使服务器没有 nvm 也不会导致预检失败。

如需覆盖，可在 profile 中显式配置：

```json
"envInit": [
  "source /etc/profile",
  "source ~/.nvm/nvm.sh"
]
```

## 查看 profiles

```bash
nuxter profiles
```

预期结果：

```text
default
```

如果没有 `.nuxter/config.json`，会提示先运行 `nuxter init`。

## 预检服务器

```bash
nuxter doctor default
```

预期过程：

```text
1. 读取 default profile
2. 校验 SSH、remote、build、process、webServer 配置
3. 连接服务器
4. 检查 tar 命令
5. 检查 remote.root 是否可写
6. 创建并检查 bak 是否可写
7. SSR + PM2 模式下检查 PM2；如果应用名不存在，部署时会自动创建
8. Nginx 模式下检查 nginx 命令
9. owner/group 为 auto 时尝试识别 Nginx 用户和组
```

成功时预期输出：

```text
预检: default -> example.com
预检通过
```

失败时会输出失败阶段，例如 SSH 连接失败、远程目录不可写、PM2 应用名重复、Nginx owner/group 无法识别。

## 模拟部署

```bash
nuxter deploy default --dry-run
```

预期结果：

```text
部署包: default-260608-153000
profile: default
host: example.com
remote root: /www/web/www.test.com
dist: /www/web/www.test.com/dist
local archive: .nuxter/tmp/dist.tar.gz
remote archive: /tmp/nuxter-www-test-default.tar.gz
staging: /tmp/nuxter-www-test-default-staging
backup: /www/web/www.test.com/bak/default-260608-153000.tar.gz
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
nuxter deploy default
```

默认会展示部署计划并要求确认。

跳过确认：

```bash
nuxter deploy default --yes
```

不重新 build，直接使用已有输出目录：

```bash
nuxter deploy default --no-build
```

正式部署预期过程：

```text
1. 读取 default profile
2. 生成部署标识，格式为 `profile-YYMMDD-HHmmss`
3. 展示部署计划并确认
4. SSH 连接服务器
5. 执行轻量预检
6. 本地执行 build.command
7. 校验 build.output 存在且非空
8. 清空本地 .nuxter/tmp，并重新打包 build.output 到 .nuxter/tmp/dist.tar.gz
9. 清理服务器 /tmp 下的固定临时上传包和 staging 目录
10. 上传到服务器 /tmp/nuxter-<project>-<profile>.tar.gz
11. 解压到服务器 /tmp/nuxter-<project>-<profile>-staging/
12. 对 staging 设置 owner/group 和权限
13. 将当前 dist 打包为 bak/<deployId>.tar.gz
14. 用 staging 替换 dist
15. SSR + PM2 模式下执行 PM2 reload/restart；如果 PM2 应用不存在，则自动 start
16. 执行 Nginx reload
17. 清理服务器 /tmp 下的固定临时上传包和 staging 目录
18. 清理超出保留数量的 bak/*.tar.gz
```

关键保障：

- 解压失败不会影响当前 `dist`。
- 权限设置失败不会影响当前 `dist`。
- 替换 `dist` 前会先备份当前 `dist`。
- `dist` 始终是实体目录，不是软链接。

## 查看可回滚备份

```bash
nuxter backups default
```

实际读取：

```text
/www/web/www.test.com/bak/*.tar.gz
```

预期输出：

```text
default-260608-153000
default-260607-221000
```

说明：

- 输出值不包含 `.tar.gz` 后缀。
- 每个文件都是一次替换前的旧 `dist`，用于回滚。

## 回滚

交互式选择备份：

```bash
nuxter rollback default
```

指定备份：

```bash
nuxter rollback default --target default-260607-221000
```

预期过程：

```text
1. SSH 连接服务器
2. 读取 bak/*.tar.gz
3. 选择或使用 --target 指定备份
4. 解压目标包到服务器 /tmp 下的固定 staging 目录
5. 将当前 dist 打包为 bak/rollback-<target>.tar.gz
6. 用 staging 目录替换 dist
7. SSR + PM2 模式下执行 PM2 reload/restart
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
    "command": "pnpm run build"
  },
  "process": {
    "name": "web-www-test"
  }
}
```

部署后会执行 PM2 和 Nginx reload。首次部署时，如果 `process.name` 对应的 PM2 应用不存在，会自动执行：

```bash
pm2 start /www/web/www.test.com/dist/server/index.mjs --name web-www-test
```

后续部署会使用 `process.action` 对同名应用执行 `pm2 reload` 或 `pm2 restart`。`process.name` 必须唯一；如果远程存在多个同名 PM2 应用，部署会中止。

### Static

适用于 SSG、SPA 或纯静态输出。

典型配置：

```json
{
  "build": {
    "mode": "static",
    "command": "pnpm run generate"
  }
}
```

Static 模式默认 `process.type` 为 `none`，部署后不会检查或重启 PM2，只执行 Nginx reload。

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
