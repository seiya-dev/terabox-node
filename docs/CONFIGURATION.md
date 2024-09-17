## Configuration

1. Open your Terabox cloud.
2. Open the browser's developer tools (F12).
3. Go to the "Application" tab.
4. Select the "Cookies" item in the left panel.
5. Look for the "ndus" cookie value and copy it to "config/.config.yaml".

For Downloading files using app-getdl.js and app-getdl-share.js you need Aria2 RPC server

## "config/.config.yaml" example

```yaml
accounts:
  MainAcc: Y-DSDSD...
  SecondAcc: YDvrwD...
aria2:
  url: http://localhost:6800/jsonrpc
  secret: YOUR_ARIA2_RPC_SECRET
```
