#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

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

console.log('[INFO] TeraBox App', 'v' + meta.version, '(GetDL Module)');

const yargs = new Argv(config, ['a','l','r']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    try{
        await getDL();
    }
    catch(error){
        console.log(error);
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
    const remotePathData = await app.getRemoteDir(remotePath);
    
    if(remotePathData.errno == 0){
        let getMeta;
        if(remotePathData.list.length == 0){
            getMeta = await app.getFileMeta([remotePath]);
        }
        else{
            const fileList = [];
            for(const f of remotePathData.list){
                if(f.isdir == 0){
                    fileList.push(f.path);
                }
            }
            getMeta = await app.getFileMeta(fileList);
        }
        if(getMeta.info.length > 0){
            console.log('Aria2 WebUI ULRs:\n');
            
            const rRoot = getMeta.info[0].path.split('/').slice(0, -1).join('/') || '/';
            let folderName = '/';
            
            if(rRoot != '/'){
                folderName = rRoot.split('/').at(-1);
                folderName += '/'
            }
            
            console.log('Folder:', folderName, '\n');
            
            for(const f of getMeta.info){
                console.log(`${f.dlink} -o "${f.server_filename}"`);
            }
        }
    }
    else{
        console.log(':: Wrong remote path!');
    }
    
    console.log();
};
