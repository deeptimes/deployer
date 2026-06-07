# Nuxter 重构需求决策记录

## 1. 文档定位

本文档基于 `.codex/PRD.md` 和 `.codex/RRD.md`，对重构需求做架构级决策。它不是新的需求列表，而是把 PRD 中存在取舍空间的部分固化为可执行决策，作为后续技术方案、任务拆分和代码重构的依据。

## 2. 总体产品决策

### 决策 1：产品命名与命令收敛为 `nuxter`

- 结论：新产品命令使用 `nuxter`，保留旧命令 `nuxt-deployer` 作为兼容别名一段时间。
- 原因：`nuxter deploy prod` 这类命令更短、更像本地工具链入口，也能承载未来 `init`、`doctor`、`rollback`、`releases` 等子命令。
- 影响：`package.json#bin` 需要新增 `nuxter`，旧 `nuxt-deployer` 可继续指向同一入口。
- 验收：用户可以运行 `nuxter init`、`nuxter deploy test`、`nuxter deploy staging`、`nuxter deploy prod`。

### 决策 2：定位为全局安装的本地开发工具链

- 结论：主推荐安装方式改为全局安装，而不是项目 `devDependency`。
- 原因：用户明确希望它成为本机开发全局工具链。该工具的核心价值是统一管理多个 Nuxt 项目的部署动作和服务器 profile，而不是绑定单个项目的构建生命周期。
- 风险：全局版本变化可能影响多个项目。
- 约束：必须提供配置版本字段和兼容校验，避免新版 CLI 误读旧项目配置。
- 验收：README 和 CLI help 必须以全局安装为主路径，例如 `pnpm add -g @deeptimes/deployer` 或未来包名。

### 决策 3：项目配置固定为 `.nuxter/config.json`

- 结论：`nuxter init` 在项目根目录生成 `.nuxter/config.json`。
- 原因：比 `deploy.config.js` 更稳定、可校验、无执行副作用，也符合“有配置但低打扰”的目标。
- 不采用：不优先使用 `package.json#deployer`、`.yml`、`.ts` 配置作为主路径。
- 兼容：可以读取旧 `deploy.config.js` 并在 `init --migrate` 时迁移，但新配置只写 `.nuxter/config.json`。
- 验收：无 `.nuxter/config.json` 时，`nuxter deploy prod` 必须提示先运行 `nuxter init`。

### 决策 4：profile 是部署入口的一级概念

- 结论：`profile` 必须作为部署命令的位置参数，而不是可选参数。
- 标准命令：

```bash
nuxter deploy test
nuxter deploy staging
nuxter deploy prod
```

- 原因：部署环境是高风险选择，必须显式写在命令中，避免默认 prod 或误选交互项。
- 影响：`nuxter deploy` 不直接部署，只展示 profile 列表并提示选择或补齐参数。
- 验收：非交互模式下缺少 profile 直接失败。

### 决策 5：发布模型必须采用 `release/current`

- 结论：所有部署都必须发布到不可变 release 目录，再通过 `current` 软链切换。
- 原因：这是部署可靠性的核心。旧的覆盖式 `dist` 发布会在解压、权限、重启失败时污染线上版本。
- 验收：构建、上传、解压、权限设置失败时，线上 `current` 不变化。

## 3. 配置架构决策

### 决策 6：配置分为全局配置和项目配置

- 结论：采用双层配置。
- 全局配置：保存本机通用偏好和可复用服务器身份。
- 项目配置：保存当前项目的部署 profile、构建方式、远程目录、服务重载策略。

推荐路径：

```text
~/.nuxter/config.json          # 全局配置
<project>/.nuxter/config.json  # 项目配置
```

- 原因：全局安装必须有全局状态，但项目部署行为仍需要跟随项目提交。
- 验收：同一个全局 `nuxter` 可以在不同项目目录读取不同 `.nuxter/config.json`。

### 决策 7：配置优先级固定

- 结论：配置合并优先级从高到低为：

```text
CLI 参数 > 环境变量 > 项目 .nuxter/config.json > 全局 ~/.nuxter/config.json > 默认值
```

- 原因：CLI 参数用于单次覆盖，项目配置定义部署事实，全局配置只提供复用默认值。
- 验收：`nuxter deploy prod --no-build` 能覆盖 profile 中的 build 设置，但不写回配置文件。

### 决策 8：配置文件必须带 schema version

- 结论：`.nuxter/config.json` 必须包含 `version` 字段。
- 推荐结构：

```json
{
  "version": 1,
  "project": {
    "name": "example-web"
  },
  "profiles": {
    "prod": {}
  }
}
```

- 原因：全局工具升级后需要判断配置是否兼容，并提供迁移路径。
- 验收：不支持的版本必须停止部署，并提示运行迁移命令。

### 决策 9：`profile` 的内容必须完整可执行

- 结论：每个 profile 合并全局配置后，必须得到一份完整部署计划。
- 必填能力：
  - SSH 连接信息。
  - remote root。
  - build mode、command、output。
  - release/current 目录策略。
  - service reload 策略。
  - permission 策略。
- 原因：profile 是部署入口，不能依赖运行过程中猜测关键参数。
- 验收：`doctor prod` 能提前检查 profile 是否可执行。

### 决策 10：敏感信息不进入项目配置

- 结论：项目 `.nuxter/config.json` 不存储私钥内容、密码、sudo 密码。
- 允许存储：私钥路径、全局 identity 引用、环境变量名。
- 推荐：

```json
{
  "ssh": {
    "identity": "default-vps"
  }
}
```

- 原因：项目配置大概率会进入 git，必须避免泄露凭据。
- 验收：`nuxter init` 不允许用户粘贴私钥内容到项目配置。

## 4. 命令体系决策

### 决策 11：MVP 命令范围

- 结论：第一阶段只做以下命令：

```bash
nuxter init
nuxter doctor <profile>
nuxter deploy <profile>
nuxter releases <profile>
nuxter rollback <profile>
```

- 暂缓：`clean`、多服务器部署、健康检查自动回滚、hook 插件系统。
- 原因：先交付可靠部署闭环，避免第一版范围过大。
- 验收：MVP 可以完成初始化、预检、部署、查看版本、回滚。

### 决策 12：`init` 必须完成配置生成和项目识别

- 结论：`nuxter init` 负责生成 `.nuxter/config.json`，并尽量自动检测 Nuxt 项目。
- 必做检测：
  - package manager：`pnpm`、`npm`、`yarn`、`bun`。
  - package name。
  - build scripts。
  - Nuxt 配置文件存在性。
  - 默认输出目录。
  - 是否存在旧 `deploy.config.js`。
- 验收：初始化结束时输出已生成的 profile 和下一条建议命令。

### 决策 13：`doctor` 必须先于部署编排设计

- 结论：`doctor` 是核心功能，不是附属工具。
- 原因：服务器部署失败通常来自环境、权限、PM2、Nginx、目录可写性，必须在真正部署前发现。
- 必查项：
  - 本地项目配置合法性。
  - SSH 可连接。
  - remote root 可读写。
  - 远程可用 `tar`、`ln`、`mkdir`。
  - Nginx reload 命令存在且可执行。
  - PM2 应用存在。
  - owner/group 可解析。
- 验收：`deploy` 默认先执行轻量 doctor；`doctor` 可单独运行完整检查。

### 决策 14：`deploy` 默认交互确认，支持自动确认

- 结论：`nuxter deploy prod` 默认展示部署计划并要求确认；`--yes` 跳过确认。
- 原因：本地手动发布需要防误操作，CI 场景需要非交互。
- 确认页必须展示：
  - profile。
  - host。
  - remote root。
  - release id。
  - build command。
  - output。
  - current symlink。
  - PM2/Nginx 操作。
- 验收：`nuxter deploy prod --yes` 不出现交互问题。

### 决策 15：`rollback` 只切换版本，不重新构建

- 结论：回滚命令只操作远程 release 和服务 reload/restart。
- 原因：回滚的产品目标是快速恢复线上，不应依赖本地代码状态。
- 验收：本地没有构建产物时仍可以执行 `nuxter rollback prod`。

## 5. 发布流程决策

### 决策 16：release id 采用时间戳加 git hash

- 结论：release id 格式为 `YYYYMMDD-HHmmss-<gitShortHash>`。
- fallback：无 git hash 时使用 `YYYYMMDD-HHmmss-local`。
- 原因：时间可排序，hash 可追溯源码。
- 验收：`releases` 列表按时间倒序展示。

### 决策 17：远程目录结构固定但可配置名称

- 结论：默认结构为：

```text
<remote.root>/
  current -> releases/<releaseId>
  releases/
  uploads/
  shared/
```

- 可配置：`releasesDir`、`uploadsDir`、`sharedDir`、`currentSymlink` 名称。
- 不建议配置：release/current 模型本身。
- 验收：部署后 `current` 指向最新 release。

### 决策 18：上传包进入 `uploads`，不直接放站点根目录

- 结论：压缩包上传到 `<remote.root>/uploads/<releaseId>.tar.gz`。
- 原因：避免污染站点根目录，也便于失败部署清理。
- 验收：部署成功后默认删除该上传包；失败时提示残留路径。

### 决策 19：切换 `current` 必须是最后的关键动作之一

- 结论：只有当解压、权限、可选检查全部成功后，才切换 `current`。
- 原因：保障失败部署不影响线上。
- 验收：任一步骤失败，`current` 仍指向旧版本。

### 决策 20：服务 reload 在 `current` 切换之后执行

- 结论：先切换 `current`，再 PM2 reload/restart，再 Nginx reload。
- 原因：SSR 进程和 Nginx 应读取新 `current` 指向。
- 验收：服务操作失败时，系统应提示当前 `current` 已切换，需要用户决定回滚或重试服务 reload。

## 6. Nuxt 构建决策

### 决策 21：首期支持 SSR 和 static 两类主模式

- 结论：MVP 将渲染模式收敛为：
  - `ssr`
  - `static`
  - `custom`
- 说明：SSG、SPA、纯静态产物在部署动作上都归入 `static`。
- 原因：部署流程只关心是否需要 PM2 服务，而不是 Nuxt 内部渲染术语。
- 验收：static profile 不要求 PM2 配置。

### 决策 22：构建命令由 profile 固化，自动检测只作为默认值

- 结论：`init` 可自动推断 build command，但保存到 profile 后，部署只按配置执行。
- 原因：自动识别不能替代明确配置，尤其是多环境 build command 不同的项目。
- 默认策略：
  - `ssr`：优先 `pnpm build`。
  - `static`：优先 `pnpm generate`，没有则提示配置。
  - `custom`：必须用户填写。
- 验收：`deploy` 不在运行时临时猜测构建命令。

### 决策 23：构建输出目录必须显式存在

- 结论：build 后必须检查 output 目录存在且非空。
- 原因：避免上传空包或错误目录。
- 验收：output 不存在时部署停止，不上传。

## 7. 权限与服务决策

### 决策 24：Nginx owner/group 默认自动识别，但必须可覆盖

- 结论：默认 `owner` 和 `group` 为 `auto`。
- 识别顺序：
  1. `nginx -T` 的 `user` 指令。
  2. Nginx worker 进程用户。
  3. 常见用户探测：`www-data`、`www`、`nginx`。
  4. 失败则要求用户在 profile 显式配置。
- 验收：无法识别时不能静默使用 `www:www`。

### 决策 25：权限设置区分目录和文件

- 结论：目录默认 `755`，文件默认 `644`。
- 不采用：默认 `chmod -R 755`。
- 原因：所有文件可执行不是最小权限原则。
- 验收：部署后普通文件不是可执行权限。

### 决策 26：PM2 使用应用名作为主键

- 结论：profile 中配置 PM2 `name`，不配置 PM2 id。
- 原因：PM2 id 不稳定，应用名更适合作为部署配置。
- 验收：`doctor` 通过 `pm2 jlist` 检查应用名存在。

### 决策 27：服务策略按 mode 约束

- 结论：
  - `ssr`：必须配置 PM2 或显式声明不管理进程。
  - `static`：默认只 reload Nginx。
  - `custom`：按 profile 声明服务动作。
- 验收：SSR profile 缺少服务策略时，`doctor` 给出阻断错误。

## 8. 错误处理与回滚决策

### 决策 28：部署编排必须记录阶段状态

- 结论：部署过程按阶段执行并记录当前阶段。
- 阶段：

```text
preflight -> build -> archive -> upload -> prepareRelease -> extract
-> permission -> switchCurrent -> reloadServices -> metadata -> cleanup
```

- 原因：失败时需要给出准确位置和恢复建议。
- 验收：任意阶段失败时，终端显示失败阶段。

### 决策 29：默认不自动回滚

- 结论：MVP 中服务 reload 失败后，不自动回滚，只提示用户运行 `rollback` 或重试。
- 原因：自动回滚需要健康检查和业务可用性判断，MVP 先避免错误自动化。
- 验收：失败提示中包含上一 release 和回滚命令。

### 决策 30：保留最近 5 个 release

- 结论：默认保留最近 5 个 release，可在 profile 中覆盖。
- 原因：兼顾回滚能力和磁盘占用。
- 验收：cleanup 只删除超出保留数量且不是 current 的 release。

## 9. 暂缓需求决策

以下能力暂不进入第一阶段：

- 多服务器并行或滚动部署。
- 蓝绿/灰度发布。
- 自动健康检查后自动回滚。
- Nginx server block 生成。
- Docker 部署。
- Web UI。
- 插件系统。
- 通用 Vite/Node 框架适配。

暂缓原因：这些能力会显著扩大边界。当前重构应先解决单机 Nuxt 发布的可靠性、配置清晰度和回滚能力。

## 10. MVP 最终范围

MVP 必须交付：

- 全局命令 `nuxter`。
- `nuxter init` 生成 `.nuxter/config.json`。
- `nuxter deploy <profile>`。
- `nuxter doctor <profile>`。
- `nuxter releases <profile>`。
- `nuxter rollback <profile>`。
- profile 支持 `test`、`staging`、`prod` 等任意命名。
- release/current 目录模型。
- SSR/static/custom 三类构建模式。
- Nginx owner/group 自动识别和覆盖。
- PM2 应用名 reload/restart。
- 非交互参数 `--yes`、`--no-build`、`--dry-run`。
- 部署失败不破坏当前线上版本。

## 11. 后续技术方案必须回答的问题

- CLI 参数解析库选型。
- JSON schema 校验方案。
- 远程命令参数转义方案。
- SSH/SFTP 抽象边界。
- release/current 的远程命令实现细节。
- 从旧 `deploy.config.js` 到 `.nuxter/config.json` 的迁移策略。
- 是否更改 npm 包名，还是只新增 bin 命令。
