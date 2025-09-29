const config = {
  ssh: {
    host: '43.173.125.136',
    port: 22,
    username: 'root',
    privateKey: '~/.ssh/ezdoc_id_rsa_git',
    readyTimeout: 10000,
  },
  envInit: [
    'source /etc/profile',
    'source ~/.nvm/nvm.sh',
  ],
  remote: {
    root: '/www/web',
    site: 'tacvita.com/web',
  },
}

export default config
