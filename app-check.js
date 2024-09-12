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
} from './modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, './package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (Check Module)`);

(async () => {
    if(!config.accounts){
        console.error('[ERROR] Accounts not set!');
        return;
    }
    
    for(const a of Object.keys(config.accounts)){
        console.info('\n[INFO] Account Info:', a);
        app = new TeraBoxApp(config.accounts[a]);
        const acc_check = await app.checkLogin();
        if(acc_check.errno != 0){
            console.error('[ERROR] "ndus" cookie is BAD!');
            continue;
        }
        await showAccountInfo(app);
    }
})();
