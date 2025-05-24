#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import input from '@inquirer/input';
import select from '@inquirer/select';

import Argv from './module-argv.js';
import TeraBoxApp from 'terabox-api';

import {
    loadYaml,
    selectAccount,
    showAccountInfo,
    selectRemotePath,
} from './module-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (FileManager Module)`);

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
    
    console.log();
    await showAccountInfo(app);
    
    const remotePath = await selectRemotePath(yargs.getArgv('r'));
    const remotePathData = await app.getRemoteDir(remotePath);
    console.log();
    
    if(remotePathData.errno == 0){
        console.log(':: Selected Remote Path:', remotePath, '\n');
        
        const mode = await select({
            message: '[INFO] Select Account:',
            choices: ['copy', 'move', 'rename', 'delete'],
        });
        
        if(mode == 'delete'){
            await app.updateAppData();
            const fmDelete = await app.filemanager(mode, [remotePath]);
            console.log(fmDelete);
            
            return;
        }
        
        if(mode == 'rename'){
            const newname = await input({ message: 'New Name:' });
            
            await app.updateAppData();
            const fmRename = await app.filemanager(mode, [{
                "path": remotePath,
                "newname": newname,
            }]);
            console.log(fmRename);
            
            return;
        }
        
        console.log('[WARN] Not Implemented!');
    }
}
