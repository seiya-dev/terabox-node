## Configuration
Install GIT, NodeJS (v.20+) and PNPM.

```
git clone --depth 1 --branch <version> https://github.com/seiya-dev/terabox-node
cd terabox-node
pnpm i
pnpm link --global
```

## Auth cookies

0. Open your Terabox cloud.
1. [Login into account](https://www.terabox.com/wap/outlogin).
2. Open the browser's developer tools (F12).
3. Go to the "Application" tab.
4. Select the "Cookies" item in the left panel.
5. Look for the "ndus" cookie value and copy it to "app/.config.yaml".

For downloading files using tb-getdl and tb-getdl-share you need Aria2 RPC server.
Aria2 RPC server start command example: 
```
aria2c -x 16 -s 10 -j 4 -k 1M --enable-rpc --rpc-allow-origin-all=true --dir=D:/Downloads --rpc-secret=YOUR_ARIA2_RPC_SECRET --input-file=%USERPROFILE%/aria2.session --save-session=%USERPROFILE%/aria2.session --save-session-interval=60 --force-save=true
```

## "app/.config.yaml" example

```yaml
accounts:
  MainAcc: Y-DSDSD...
  SecondAcc: YDvrwD...
aria2:
  url: http://localhost:6800/jsonrpc
  secret: YOUR_ARIA2_RPC_SECRET
```
