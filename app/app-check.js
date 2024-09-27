#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Argv from '../modules/app-argv.js';
import TeraBoxApp from '../modules/api.js';

import {
    loadYaml,
    selectAccount,
    showAccountInfo,
} from '../modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, '../config/.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (Check Module)`);

const yargs = new Argv(config, ['a']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    if(!config.accounts){
        console.error('[ERROR] Accounts not set!');
        return;
    }
    
    if(yargs.getArgv('a')){
        await getAcc(yargs.getArgv('a'));
    }
    else{
        console.log('\n[INFO] Total Accounts:', Object.keys(config.accounts).length)
        for(const acc of Object.keys(config.accounts)){
            await getAcc(acc);
        }
    }
})();

async function getAcc(acc){
    console.info('\n[INFO] Account Info:', acc);
    app = new TeraBoxApp(config.accounts[acc]);
    const acc_check = await app.checkLogin();
    if(acc_check.errno != 0){
        console.error('[ERROR] "ndus" cookie is BAD!');
        return;
    }
    await showAccountInfo(app);
}
