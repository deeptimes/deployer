import type { DeployToolConfig, Options } from '../types'

export async function remoteOperation(ssh, cfgs: DeployToolConfig, opts: Options) {
  try {
    const sitePath = `${cfgs.remote.root}/${cfgs.remote.site}`
    const tarFile = cfgs.dist

    /* 检查待解压是否存在 */
    const fileExists = await ssh.useExeCommand(`test -f ${sitePath}/${tarFile}`, '检查：待部署文件是否存在!')

    if (!fileExists) {
      console.error('终止：待部署文件不存在，即将结束本次操作!')
      return
    }

    /* 检查`Dist`目录是否存在 */
    const distExists = await ssh.useExeCommand(`cd ${sitePath} && [ -d "dist" ]`, '检查：待部署目录是否存在!')

    /* 如果已存在则备份 */
    if (distExists.success) {
      const timestamp = Date.now()
      await ssh.useExeCommand(`cd ${sitePath} && mkdir -p bak`, '创建：备份目录!')
      await ssh.useExeCommand(`cd ${sitePath} && tar -czf bak/${timestamp}.tar.gz dist`, '备份：已存在的旧项目!')
      await ssh.useExeCommand(`cd ${sitePath} && rm -rf dist/*`, '删除：已存在的旧项目!')
    }
    else {
      await ssh.useExeCommand(`cd ${sitePath} && mkdir dist`, '创建：待部署目录!')
    }

    /* 解压新的 dist.tar.gz */
    await ssh.useExeCommand(`cd ${sitePath} && tar -xzf ${tarFile} -C dist --warning=no-unknown-keyword`, '解压：待部署项目文件!')

    // 设置权限
    await ssh.useExeCommand(`cd ${sitePath} && chown -R www:www dist && chmod -R 755 dist`, '权限：配置www用户组及0755权限！')

    // 重启服务
    if (opts.render === 'ssr' && opts.pm2id) {
      await ssh.useExeCommand(`pm2 restart ${opts.pm2id} > /dev/null 2>&1`, '重启：Service PM2 Restart')
    }
    await ssh.useExeCommand('source /etc/profile && nginx -s reload', '重启：Service Nginx Reload')

    /* 清理远程文件 */
    await ssh.useExeCommand(`cd ${sitePath} && rm -rf ${tarFile}`, '清理：刚上传的远程文件!')
  }
  catch (error) {
    console.error('远程操作出现错误:', error)
  }
}
