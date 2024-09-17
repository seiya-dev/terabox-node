# Usage
Install NodeJS version 20 or higher. Then install required modules with npm (or other preferred package manager).

## Scripts

### Check Accounts:
**node "app/app-check.js"**
```
no options for this script
```
### Upload Folders/Files:
**node "app/app-uploader.js" <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-l "/"             select local directory
-r "/"             select remote directory
--no-rapidupload   don't use rapidupload function
```
### Create TBHash for RapidUpload:
**node "app/app-mktbhash.js" <options>**
```
-l "/"             select local directory
--skip-chunks      don't create chunck hashes
```
### Download Files from Remote via Aria2 RPC:
**node "app/app-getdl.js" <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
### Download Shared Files via Aria2 RPC:
**node "app/app-getdl-share.js" <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-s "gObGxQGxQGx"   input shared url
```
### Fetch File Meta Information from Remote:
**node "app/app-filemeta.js" <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
