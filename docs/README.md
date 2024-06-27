# TeraBox App CLI (NodeJS)

NodeJS CLI tool for downloading/uploading files from/to your TeraBox cloud account without having to use the website or app.

## Configuration

1. Open your Terabox cloud.
2. Open the browser's developer tools (F12).
3. Go to the "Application" tab.
4. Select the "Cookies" item in the left panel.
5. Look for the "ndus" cookie value and copy it to config.json.

```json
{
    "accounts": [
        "MyMainAcc": "Y-DSDSD...",
        "MySecondAcc": "YDvrwD..."
    ]
}
```

## Usage
Install NodeJS version 20 or higher. Then install required modules with npm (or other preferred package manager).

### CLI parameters
- -a "select account (by name from config.json)"
- -l "select local directory"
- -r "select remote dirctory"
