# Usage

## Scripts

### Check Accounts:
**tb-check <options>**
```
no options for this script
```
### Upload Folders/Files:
**tb-uploader <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-l "/"             select local directory
-r "/"             select remote directory
--no-rapidupload   don't use rapidupload function
```
### Create TBHash for RapidUpload:
**tb-mkhash <options>**
```
-l "/"             select local directory
--skip-chunks      don't create chunck hashes
```
### Download Files from Remote via Aria2 RPC:
**tb-getdl <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
### Download Shared Files via Aria2 RPC:
**tb-getdl-share <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-s "gObGxQGxQGx"   input shared url
```
### Fetch File Meta Information from Remote:
**tb-filemeta <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
