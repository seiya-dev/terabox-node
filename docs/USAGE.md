# Usage
Install NodeJS version 20 or higher. Then install required modules with npm (or other preferred package manager).

## Scripts

### Check Accounts:
**node "app-check.js"**
```
no options for this script
```
### Upload Folders/Files:
**node "app-uploader.js"**
```
-a "acc"           select account (by name from ".config.yaml")
-l "/"             select local directory
-r "/"             select remote directory
--no-rapidupload   don't use rapidupload function
```
### Create TBHash for RapidUpload:
**node "app-mktbhash.js"**
```
-l "/"             select local directory
--skip-chunks      don't create chunck hashes
```
### Download Files from Remote:
**node "app-getdl.js"**
```
IN DEVELOPMENT, use alist for now
```
### Fetch File Meta Information from Remote:
**node "app-filemeta.js"**
```
IN DEVELOPMENT
```