# Usage

## Scripts

### Check Accounts:
**pnpm exec tb-check <options>**
```
no options for this script
```
### Upload Folders/Files:
**pnpm exec tb-uploader <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-l "/"             select local directory
-r "/"             select remote directory
--no-rapidupload   don't use rapidupload function
```
### Create TBHash for RapidUpload:
**pnpm exec tb-mkhash <options>**
```
-l "/"             select local directory
--skip-chunks      don't create chunck hashes
```
### Download Files from Remote via Aria2 RPC:
**pnpm exec tb-getdl <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
### Download Shared Files via Aria2 RPC:
**pnpm exec tb-getdl-share <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-s "gObGxQGxQGx"   input shared url
```
### Fetch File Meta Information from Remote:
**pnpm exec tb-filemeta <options>**
```
-a "acc"           select account (by name from ".config.yaml")
-r "/"             select remote directory
```
