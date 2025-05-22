#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { filesize } from 'filesize';
import { fetch } from 'undici';

import Argv from './module-argv.js';
import TeraBoxApp from 'terabox-api';

import {
    loadYaml,
    selectAccount,
    showAccountInfo,
    selectRemotePath,
} from 'terabox-api/helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (FileMeta Module)`);

const yargs = new Argv(config, ['a','r']);
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
        console.log(':: Selected Remote Path:', remotePath, '\n');
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
    
    if(getMeta.errno){
        console.log(`:: Failed to Get Data...`);
        console.log(`:: ERROR #${getMeta.errno}`);
        return;
    }
    
    for(const f of getMeta.info){
        if(f.isdir == 1){
            continue;
        }
        
        console.log('FS ID:', f.fs_id);
        console.log('Path :', f.path.split('/').slice(0, -1).join('/') || '/');
        console.log('File :', f.server_filename);
        console.log('Size :', f.size);
        console.log('Size :', filesize(f.size, {standard: 'iec', round: 2}));
        
        console.log();
        console.log('Fetching Hashes...');
        const hashReq = await fetch(f.dlink, {
            headers:{
                'User-Agent': app.params.ua,
                'Range': 'bytes=0-' + (256 * 1024 - 1), // 256kb
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(app.TERABOX_TIMEOUT * 2),
        });
        
        if (hashReq.status !== 206) {
            console.log(`Failed to Get Data...`);
            continue;
        }
        
        const hash = createHash('md5');
        for await (const chunk of hashReq.body) {
            hash.update(chunk);
        }
        
        const md5slice = hash.digest('hex');
        
        const crc32 = parseInt(hashReq.headers.get('x-bs-meta-crc32'));
        const md5hash = hashReq.headers.get('content-md5');
        
        console.log('CRC32   :', crc32, '(int)');
        console.log('CRC32   :', crc32.toString(16).toUpperCase().padStart(8, '0'), '(hex)');
        console.log('MD5Slice:', md5slice);
        console.log('MD5File :', md5hash);
        console.log();
    }
} 
