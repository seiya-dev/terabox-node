#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import { filesize } from 'filesize';
import Argv from './modules/app-argv.js';
import TeraBoxApp from './modules/api.js';

import {
    loadYaml,
    selectAccount,
    showAccountInfo,
    selectRemotePath,
} from './modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, './package.json'));

console.log('[INFO] TeraBox App', 'v' + meta.version, '(FileMeta Module)');

const yargs = new Argv(config, ['a','l','r']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    try{
        await getMeta();
    }
    catch(error){
        console.error(':: FAILED:', error);
    }
})();


async function getMeta(){
    if(!config.accounts){
        console.error('[ERROR] Accounts not set!');
        return;
    }

    let cur_acc;
    if(yargs.getArgv('a')){
        cur_acc = config.accounts[yargs.getArgv('a')];
    }
    else{
        cur_acc = await selectAccount(config);
    }
    
    app = new TeraBoxApp(cur_acc);
    
    const acc_check = await app.checkLogin();
    if(acc_check.errno != 0){
        console.error('[ERROR] "ndus" cookie is BAD!');
        return;
    }
    
    await showAccountInfo(app);
    console.log();
    
    const remotePath = await selectRemotePath(yargs.getArgv('r'));
    const remotePathData = await app.getRemoteDir(remotePath);
    
    if(remotePathData.errno == 0){
        await showMeta(remotePath, remotePathData);
    }
}

async function showMeta(rPath, pathData){
    let getMeta;
    if(pathData.list.length == 0){
        getMeta = await app.getFileMeta([rPath]);
    }
    else{
        const fileList = [];
        for(const f of pathData.list){
            if(f.isdir == 0){
                fileList.push(f.path);
            }
        }
        getMeta = await app.getFileMeta(fileList);
    }
    
    for(const f of getMeta.info){
        if(f.isdir == 1){
            continue;
        }
        
        console.log(f);
        
        const fdata = {
            dlink:   f.dlink,
            root:    f.path.split('/').slice(0, -1).join('/') || '/',
            file:    f.server_filename,
            size:    f.size,
            sizef:   filesize(f.size, {standard: 'iec', round: 3, pad: true}),
        };
        
        // reqh.headers.get('x-bs-meta-crc32')
        // reqh.headers.get('content-md5')
        // reqh.headers.get('x-bs-file-size')
        
        // console.log(fdata);
    }
} 