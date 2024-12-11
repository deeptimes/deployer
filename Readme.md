# Readme

This tools is used to package the nuxt project locally, quickly deploy it to the remote server, and automatically restart the pm2 application.

## install
```
pnpm add @deeptimes/deployer
```

add `deployer.config.js` to your project root
```js
const config = {
  ssh: {
    host: 'localhost',
    port: 22,
    username: 'root',
    privateKey: '~/.ssh/id_rsa',
    readyTimeout: 20000,
  },
  temp: 'temp',
  output: '.output',
  dist: 'dist.tar.gz',
  excludes: ['.DS_Store', '._.DS_Store'],
  remote: {
    root: '/www/web',
    site: 'www_test_com',
  },
}

export default config
```

add`"deployer": "nuxt-deployer"` to your `package.json`

```json
{
  "scripts": {
    "deployer": "nuxt-deployer"
  }
}
```
## usage

```
pnpm deployer
```
