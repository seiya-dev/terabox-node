## Configuration
Goto repository folder and install all needed dependencies, because nothing is compiled and no executable.
```bash
cd terabox-node
npm install
```

1. Open your Terabox cloud.
2. Open the browser's developer tools (F12).
3. Go to the "Application" tab.
4. Select the "Cookies" item in the left panel.
5. Look for the "ndus" cookie value and copy it to ".config.yaml".

You can add multiple accounts and access their files and folders.

In config.yaml
```yaml
accounts:
  MainAcc: Y-DSDSD...
  SecondAcc: YDvrwD...
```
