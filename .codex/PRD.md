# Nuxt Deployer 系统性重构 PRD

## 1. 文档信息

- 产品名称：Nuxt Deployer
- 当前包名：`@deeptimes/deployer`
- 当前命令：`nuxt-deployer`
- 文档类型：产品需求文档（PRD）
- 需求来源：`.codex/RRD.md`、当前仓库源码与 README
- 目标阶段：系统性重构规划

## 2. 背景与问题

当前项目是一个用于将 Nuxt 项目部署到自有服务器的 TypeScript CLI 工具。现有流程已经实现了本地构建、压缩 `.output`、SFTP 上传、远程解压、PM2 重启、Nginx reload、本地临时文件清理等核心动作。

但现有实现更接近单人单项目脚本，主要问题如下：

- 配置依赖项目根目录的 `deploy.config.js`，对新项目接入不够无感。
- 发布目录采用覆盖式 `dist` 目录，缺少不可变 release、原子切换和快速回滚。
- SSR、SSG 只通过人工选择区分，缺少自动识别、可扩展 preset 和自定义构建命令。
- 远程权限固定为 `www:www`，无法适配不同服务器的 Nginx 用户和用户组。
- PM2 进程选择依赖 `web-` 前缀，缺少明确的应用绑定和 profile 管理。
- 全局配置、项目配置、环境配置、密钥配置的职责边界不清晰。
- 缺少 preflight 检查、dry run、部署报告、失败恢复、非交互式 CI/CD 模式。

## 3. 原始需求理解

用户需要一个可以快速部署 Nuxt 项目到自有服务器的通用工具。它应基于当前工具的工作流继续演进，但能力上需要覆盖更多 Nuxt 场景，包括 SSR、SSG 及其他可扩展构建模式。

用户希望工具可以作为依赖安装，并尽量减少显式配置，不再强制每个项目都新增 `deploy.config.js`。同时需要判断是否适合做成全局依赖，并支持全局配置和 profile。部署到服务器后，工具需要识别正确的 Nginx 所有者和权限，并对解压后的目录设置正确用户、组和权限。

核心主流程为：

1. 选择发布版本、部署选项和参数。
2. 本地 build。
3. 打包 `.output`。
4. 上传 `dist.tar.gz`。
5. 服务器解压到新目录。
6. 切换当前版本。
7. 执行 PM2 / Nginx reload 或 restart。

## 4. 产品定位

Nuxt Deployer 是一个面向个人开发者、小团队和轻量自运维场景的 Nuxt 发布工具。它不替代 Kubernetes、GitHub Actions、Docker 平台或完整 PaaS，而是为“本地构建 + SSH 发布到自有服务器”的常见场景提供稳定、可回滚、低配置成本的标准化体验。

## 5. 目标用户

- 独立开发者：维护多个 Nuxt 站点，希望用统一命令部署到 VPS。
- 小团队前端/全栈开发者：需要安全可控地把项目发布到自有服务器。
- 运维能力有限的项目 owner：希望减少服务器手工操作，避免因目录、权限、PM2 进程选择错误导致发布事故。

## 6. 产品目标

- 接入成本低：已有 Nuxt 项目安装后即可通过初始化或自动检测完成部署配置。
- 发布可靠：采用不可变 release 目录和 `current` 软链切换，支持快速回滚。
- 配置清晰：支持全局配置、项目配置、profile、CLI 参数的优先级合并。
- 场景完整：覆盖 SSR、SSG、SPA/static、Nitro preset、自定义构建命令。
- 服务器适配：自动检测或显式配置 Nginx user/group、PM2 应用、Node 环境初始化命令。
- 可自动化：支持交互式使用，也支持 CI/CD 非交互式参数运行。
- 可观测：输出部署摘要、远程命令日志、失败原因和下一步建议。

## 7. 非目标

- 不做通用云平台部署系统。
- 不内置域名、证书、Nginx 站点配置生成作为首期核心能力。
- 不首期支持多服务器并行发布、灰度发布和蓝绿流量治理。
- 不强制引入 Docker。
- 不管理服务器 Node、PM2、Nginx 的安装生命周期，仅做检测和清晰报错。

## 8. 核心用户场景

### 8.1 首次接入项目

用户在 Nuxt 项目中安装工具后运行：

```bash
pnpm add -D @deeptimes/deployer
pnpm nuxt-deployer init
```

工具自动检测 Nuxt 项目、package scripts、构建输出目录、渲染模式，并引导选择或创建 profile。初始化结果优先写入 `package.json` 的 `deployer` 字段或 `.deployer/config.{json,yml}`，避免强制增加 `deploy.config.js`。

### 8.2 日常交互式部署

用户运行：

```bash
pnpm nuxt-deployer deploy
```

工具展示 profile、目标环境、渲染模式、版本号、是否 build、是否 dry run、是否保留备份等选项。确认后完成构建、打包、上传、远程 release 创建、权限处理、软链切换、服务重载。

### 8.3 非交互式部署

用户在 CI 或脚本中运行：

```bash
pnpm nuxt-deployer deploy --profile prod --mode ssr --yes
```

工具跳过交互确认，按配置和参数执行。缺失关键参数时直接失败并输出明确错误。

### 8.4 快速回滚

用户运行：

```bash
pnpm nuxt-deployer rollback --profile prod
```

工具列出最近 release，默认回滚到上一个成功版本。回滚只切换 `current` 软链并 reload/restart 服务，不重新上传。

### 8.5 服务器预检

用户运行：

```bash
pnpm nuxt-deployer doctor --profile prod
```

工具检查 SSH、远程目录、磁盘空间、tar、Node、PM2、Nginx、权限、Nginx worker 用户、PM2 应用存在性，并给出修复建议。

## 9. 功能需求

### 9.1 CLI 命令

首期应支持以下命令：

- `nuxt-deployer init`：初始化项目部署配置。
- `nuxt-deployer deploy`：执行部署。
- `nuxt-deployer doctor`：执行本地和远程环境预检。
- `nuxt-deployer profiles`：查看可用 profile 和配置来源。
- `nuxt-deployer releases`：查看远程 release 列表。
- `nuxt-deployer rollback`：回滚到指定 release 或上一个 release。
- `nuxt-deployer clean`：清理远程历史 release 和本地临时产物。

### 9.2 安装形态

推荐策略：

- 主推荐：项目内 `devDependency` 安装，保证团队、CI 和项目脚本使用同一版本。
- 辅助支持：全局安装作为快捷入口，但全局命令只负责读取当前项目配置并执行，不应成为唯一推荐方式。
- 支持 `pnpm dlx @deeptimes/deployer init` 进行一次性初始化。

判断依据：

- 部署行为与项目构建命令、Nuxt 版本、输出目录强相关，项目内依赖更可复现。
- 全局配置适合存放服务器 profile、默认 SSH 用户、密钥路径、组织级默认值，不适合承载全部项目行为。

### 9.3 配置体系

配置来源优先级从高到低：

1. CLI 参数。
2. 环境变量。
3. 项目配置：`package.json#deployer`、`.deployer/config.yml`、`deployer.config.{ts,js}`。
4. 全局 profile：`~/.config/nuxt-deployer/config.yml`。
5. 工具默认值。

推荐支持以下配置模型：

```yaml
profiles:
  prod:
    ssh:
      host: example.com
      port: 22
      username: deploy
      privateKey: ~/.ssh/id_rsa
    remote:
      root: /www/web/example.com
      releasesDir: releases
      currentSymlink: current
      sharedDir: shared
    build:
      mode: ssr
      command: pnpm build
      output: .output
      archive: dist.tar.gz
    process:
      type: pm2
      name: web-example
      reload: true
    webServer:
      type: nginx
      reloadCommand: nginx -s reload
      owner: auto
      group: auto
    retain:
      releases: 5
```

### 9.4 Nuxt 模式识别

工具应支持自动检测和手动覆盖：

- SSR：默认构建命令 `pnpm build`，输出 `.output`，发布后 PM2 reload/restart，并 reload Nginx。
- SSG/static：默认构建命令 `pnpm generate` 或用户自定义命令，输出 `.output/public` 或 `dist`，发布后只 reload Nginx。
- SPA/static：允许发布静态目录，不要求 PM2。
- Custom：允许用户显式配置 build command、output、post-deploy hook。

检测依据包括：

- `nuxt.config` 中 `ssr`、`nitro.preset`、`routeRules` 等配置。
- `package.json` scripts。
- 构建后输出目录结构。

### 9.5 发布版本与目录结构

远程目录建议改为 release 模型：

```text
/www/web/example.com
  current -> releases/20260608-153000-a1b2c3
  releases/
    20260608-153000-a1b2c3/
    20260607-220100-c9d8e7/
  shared/
  uploads/
  logs/
```

部署流程：

1. 生成 release id：时间戳 + git commit short hash，无法读取 git 时使用时间戳。
2. 上传压缩包到远程临时目录。
3. 创建新 release 目录。
4. 解压到新 release 目录。
5. 执行权限设置。
6. 执行可选健康检查。
7. 原子切换 `current` 软链。
8. PM2 reload/restart。
9. Nginx reload。
10. 记录部署元数据。
11. 清理临时包和超出保留数量的旧 release。

### 9.6 权限与 Nginx 用户识别

必须支持：

- `owner: auto`、`group: auto` 自动识别。
- 显式覆盖 `owner`、`group`。
- 仅检查不修改的 dry run。

自动识别优先级：

1. 读取 `nginx -T` 中的 `user` 指令。
2. 读取 Nginx master/worker 进程用户。
3. 常见 fallback：`www-data`、`www`、`nginx`。
4. 如果无法确定，阻断部署并提示用户配置。

权限默认策略：

- 目录：`755`。
- 文件：`644`。
- 可执行脚本：保留执行位或由用户 hook 设置。
- 不建议默认递归 `chmod -R 755` 到所有文件。

### 9.7 PM2 与服务重载

SSR 场景必须支持：

- 按 profile 绑定 PM2 应用名或 id。
- 自动从 `pm2 jlist` 读取候选应用。
- 优先使用应用名，避免 PM2 id 变化导致误重启。
- 支持 `reload` 和 `restart` 两种策略。
- 支持 ecosystem 文件路径。
- 支持 `--no-pm2` 或 static 模式跳过 PM2。

### 9.8 Preflight 与 Dry Run

`doctor` 和 `deploy --dry-run` 应检查：

- 本地 package manager、build script、输出目录、git 状态。
- SSH 连接、远程目录可写性、磁盘空间。
- 远程 `tar`、`ln`、`nginx`、`pm2`、Node 环境。
- Nginx 配置 reload 是否可执行。
- PM2 应用是否存在。
- owner/group 是否可识别。

### 9.9 日志与部署记录

每次部署应生成：

- 本地日志：`.deployer/logs/{releaseId}.log` 或临时目录。
- 远程元数据：`releases/{releaseId}/deploy.json`。
- 终端摘要：profile、release id、构建模式、远程路径、耗时、包大小、重载结果。

`deploy.json` 建议包含：

- releaseId
- package name/version
- git branch/commit
- build command
- render mode
- deploy user
- deployedAt
- previousRelease
- currentSymlink

### 9.10 安全要求

- 不在项目配置中写入私钥内容，只引用路径或环境变量。
- SSH 密码、sudo 密码不落盘。
- 远程命令必须做参数转义，避免路径和 profile 输入造成命令注入。
- 默认不执行 destructive 操作；清理旧 release 需要可配置保留数量。
- 所有远程 `rm` 操作必须限制在配置的站点根目录内。

## 10. 体验要求

- 交互式流程应先做 preflight，再进入确认页。
- 确认页必须展示即将影响的服务器、目录、profile、服务名、当前版本、新版本。
- 失败时输出“失败步骤 + 原始错误 + 建议处理方式”。
- 终端输出应减少无意义 stdout，关键步骤使用稳定状态文案。
- 用户中断时应关闭 SSH/SFTP，并提示是否存在远程临时文件。

## 11. 验收标准

### 11.1 MVP 验收

- 可以在无 `deploy.config.js` 的 Nuxt 项目中完成初始化和部署。
- 支持至少一个全局 profile 和一个项目 profile。
- SSR 项目可以构建、上传、切换 `current`、PM2 reload、Nginx reload。
- SSG/static 项目可以构建、上传、切换 `current`、Nginx reload。
- 支持 `rollback` 回滚到上一个 release。
- 支持 `doctor` 检查 SSH、远程目录、PM2、Nginx、权限用户。
- 支持自动识别 Nginx owner/group，识别失败时允许配置覆盖。
- 支持 `--yes` 非交互部署。
- 部署失败不会破坏当前线上 `current`。

### 11.2 质量验收

- 核心配置解析有单元测试。
- release 目录生成、软链切换、回滚策略有单元测试或集成测试。
- 远程命令构造必须集中封装并测试路径转义。
- TypeScript 开启更严格类型约束，减少 `any` 和隐式字段。
- README 更新为新安装、初始化、部署、回滚流程。

## 12. 产品指标

- 首次接入一个已有 Nuxt 项目的配置时间小于 5 分钟。
- 常规部署命令不超过 1 条。
- 失败后能在 1 条命令内回滚到上一版本。
- 部署成功率可通过 deploy log 追踪。
- 线上目录切换时间小于 1 秒，不包含构建和上传。

## 13. 推荐重构架构

建议将现有线性脚本拆分为以下模块：

```text
src/
  cli/                # 命令入口、参数解析、交互
  config/             # 配置发现、合并、校验、profile
  project/            # Nuxt 项目检测、package manager 检测
  build/              # 构建执行、输出校验
  archive/            # 压缩、排除规则、包大小
  ssh/                # SSH/SFTP 客户端、远程命令安全封装
  remote/             # 远程目录、release、权限、服务控制
  deploy/             # 部署编排、状态机、失败处理
  logs/               # 日志、部署摘要
  types/              # 公共类型
```

部署编排应采用明确状态机：

```text
preflight -> build -> archive -> upload -> prepareRelease -> extract
-> setPermission -> healthcheck -> switchCurrent -> reloadServices
-> writeMetadata -> cleanup
```

## 14. 专业建议

### 14.1 不建议继续使用覆盖式 `dist`

当前“备份旧 dist、清空 dist、解压新 dist”的方式在失败时容易让线上目录处于半更新状态。应改为不可变 release + 原子软链切换。只要 `current` 不切换，线上版本就不受失败部署影响。

### 14.2 项目依赖优先，全局配置辅助

该工具与 Nuxt 版本、包管理器、构建命令强绑定。主路径应是项目内 `devDependency`，以保证团队成员和 CI 的行为一致。全局安装可以保留，但更适合作为“管理 profile 的外壳”和个人快捷命令。

### 14.3 配置应分层，不应完全“零配置”

真正零配置不现实，因为服务器地址、目录、PM2 应用、权限策略无法可靠推断。更合理的目标是“低配置 + 自动检测 + 明确覆盖”。敏感信息放全局或环境变量，项目行为放项目配置。

### 14.4 先做可靠性，再做功能广度

建议优先实现 release 模型、rollback、doctor、profile、权限识别。多服务器、灰度、可视化面板等高级能力可后置。部署工具最重要的产品价值是失败时不破坏线上。

### 14.5 PM2 应使用应用名绑定

PM2 id 会随进程列表变化，作为持久配置不稳定。应优先使用 PM2 应用名，并允许 profile 明确绑定。

### 14.6 权限策略要可解释

默认 `chown -R www:www` 和 `chmod -R 755` 对不同发行版并不可靠，也会让所有文件变成可执行权限。建议识别 Nginx 用户后分别设置目录和文件权限，并在部署摘要中展示最终 owner/group。

### 14.7 需要支持 CI 模式

即便产品主要面向本地手动部署，也应从第一版重构就支持 `--yes`、`--profile`、`--mode`、`--no-build`、`--dry-run`。这会倒逼配置模型清晰，也便于后续接入 GitHub Actions。

## 15. 版本规划

### Phase 1：可靠发布基础

- 新配置体系和 profile 合并。
- `init`、`doctor`、`deploy`。
- release 目录和 `current` 软链。
- SSR/SSG/static 基础支持。
- PM2 应用名 reload。
- Nginx owner/group 识别。
- rollback。

### Phase 2：自动化与可观测

- 非交互式 CI 模式完善。
- deploy log 和 remote metadata。
- releases 列表、clean 策略。
- 构建输出自动识别增强。
- README 和迁移指南。

### Phase 3：高级发布能力

- 多服务器顺序发布。
- 健康检查与失败自动回滚。
- hook 体系。
- Nginx 配置检测增强。
- 插件式 framework adapter。

## 16. 待确认问题

- 是否只面向 Nuxt，还是未来要扩展到通用 Node/Vite/静态站点部署？
- 是否需要内置 sudo 支持，还是要求部署用户已经具备目标目录和 reload 权限？
- 是否需要支持 Windows 本地开发机，还是优先 macOS/Linux？
- 是否需要生成 Nginx server block，还是只 reload 已有配置？
- 是否允许工具在服务器创建标准目录结构，还是必须适配现有目录结构？
