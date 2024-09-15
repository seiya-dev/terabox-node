#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { request } from 'undici';

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

console.log(`[INFO] ${meta.name_ext} v${meta.version} (GetDL Module)`);
let sRoot = '';

const yargs = new Argv(config, ['a','r']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    try{
        await getDL();
    }
    catch(error){
        console.error(error);
    }
})();

async function getDL(){
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
    const fsList = await getRemotePaths(remotePath);
    
    if(fsList.length > 0){
        await addDownloads(fsList);
    }
    
};

async function getRemotePaths(remotePath){
    console.log(':: Requesting Remote:', remotePath);
    const remotePathData = await app.getRemoteDir(remotePath);
    
    if(remotePathData.errno == 0){
        if(remotePathData.list.length == 0){
            sRoot = remotePath.split('/').slice(0, -1).join('/');
            return [remotePath];
        }
        else{
            if(sRoot == ''){
                sRoot = remotePathData.list[0].path.split('/').slice(0, -1).join('/') || '/';
            }
            const fileList = [];
            for(const f of remotePathData.list){
                if(f.isdir == 1){
                    const subList = await getRemotePaths(f.path);
                    fileList.push(...subList);
                }
                else{
                    fileList.push(f.path);
                }
            }
            return fileList;
        }
    }
    else{
        console.log(':: Wrong remote path!');
        return [];
    }
    
    console.log();
}

function stripPath(rPath){
    return rPath.replace(sRoot, '').replace(new RegExp('^/'), '');
}

async function addDownloads(fsList){
    const getMeta = await app.getFileMeta(fsList);
    
    // aria2c -x 16 -s 10 -j 4 -k 1M --enable-rpc --rpc-allow-origin-all=true --dir=D:/Downloads --rpc-secret=YOUR_ARIA2_RPC_SECRET
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.addUri
    
    const jsonReq = { 
        jsonrpc: '2.0',
        id: 'DOWNLOAD_ID',
        method: 'aria2.addUri',
        params: [ 'token:' + config.aria2.secret ],
    };
    
    const rpcReq = [];
    for(const [i, f] of getMeta.info.entries()){
        rpcReq.push(structuredClone(jsonReq));
        
        const folderName = stripPath(f.path.split('/').slice(0, -1).join('/'));
        
        rpcReq[i].id = crypto.randomUUID();
        rpcReq[i].params.push([f.dlink]);
        rpcReq[i].params.push({ 'user-agent': app.params.ua, out: (folderName?folderName+'/':'') + f.server_filename });
    }
    
    try{
        const rpcUrl = new URL(config.aria2.url);
        const req = await request(rpcUrl, {
            method: 'POST',
            body: JSON.stringify(rpcReq),
        });
        console.log('ADDING...');
        console.log('CODE:', req.statusCode);
        // console.log(await req.body.json());
    }
    catch(error){
        error = new Error('aria2.addUri', { cause: error });
        console.error(error);
    }
}
