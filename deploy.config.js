const config = {
  ssh: {
    host: 'localhost',
    port: 22,
    username: 'root',
    privateKey: '~/.ssh/id_rsa',
    readyTimeout: 10000,
  },
  envInit: [
    'source /etc/profile',
    'source ~/.nvm/nvm.sh',
  ],
  remote: {
    root: '/www/web',
    site: '',
  },
}

export default config
