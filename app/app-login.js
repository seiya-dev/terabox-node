#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {loadYaml} from './module-helper.js';
import Argv from './module-argv.js';

import TeraBoxApp from 'terabox-api';
import input from '@inquirer/input';
import password from '@inquirer/password';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (Login)`);

const yargs = new Argv({}, []);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    app = new TeraBoxApp();
    
    const preLogin = await tryPreLogin();
    const doLogin = await tryLogin(preLogin);
    
    console.log(`[AUTH] ${doLogin.displayName}: ${doLogin.ndus}`);
})();

async function tryPreLogin(){
    try{
        const email = await input({ message: 'EMail:' });
        const preLoginData = await app.passportPreLogin(email);
        if(preLoginData.code === 0){
            preLoginData.data.email = email;
            return preLoginData.data;
        }
        console.log('ERROR:', preLoginData);
        throw new Error('Bad Response');
    }
    catch(err){
        return await tryPreLogin();
    }
}

async function tryLogin(preLogin){
    try{
        const pass = await password({ message: 'Password:' });
        const authData = await app.passportLogin(preLogin, preLogin.email, pass);
        if(authData.code === 0){
            return authData.data;
        }
        console.log('ERROR:', authData);
        throw new Error('Bad Response');
    }
    catch(err){
        return await tryLogin(preLogin);
    }
}
