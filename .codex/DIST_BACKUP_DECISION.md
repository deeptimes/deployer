# Nuxter 2.0 目录与发布模型最终决策

## 结论

Nuxter 2.0 不再采用长期展开的 `releases/current` 模型。最终采用：

```text
/www/web/www.test.com/
  dist/
  bak/
  logs/
  .nuxter/
    uploads/
    staging/
    deploy.json
```

## 关键决策

- `dist` 保持为线上实体目录，不改成软链接。
- `bak` 保存历史版本压缩包，即 `*.tar.gz`。
- 不长期保留展开后的 `releases/<releaseId>/`。
- `.nuxter/uploads` 只保存部署过程中的临时上传包。
- `.nuxter/staging` 是部署和回滚的中转目录。
- `nuxter releases <profile>` 实际列出 `bak/*.tar.gz`。
- `nuxter rollback <profile>` 会把选中的备份包解压到 staging，再替换 dist。

## 部署流程

```text
本地 build
-> 打包 build.output 为 <releaseId>.tar.gz
-> 上传到 .nuxter/uploads/<releaseId>.tar.gz
-> 解压到 .nuxter/staging/<releaseId>/
-> 设置 staging 权限
-> 备份当前 dist 到 bak/pre-<releaseId>.tar.gz
-> 用 staging/<releaseId>/ 替换 dist/
-> PM2/Nginx reload
-> 移动上传包到 bak/<releaseId>.tar.gz
-> 清理超出保留数量的 bak/*.tar.gz
```

## 回滚流程

```text
读取 bak/*.tar.gz
-> 选择或指定备份版本
-> 解压到 .nuxter/staging/rollback-<target>/
-> 备份当前 dist 到 bak/pre-rollback-<target>.tar.gz
-> 用 staging 替换 dist/
-> PM2/Nginx reload
```

## 覆盖关系

本文档覆盖 `.codex/DECISIONS.md` 中所有与 `release/current` 软链模型相关的旧描述。
