#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { request } from 'undici';
import input from '@inquirer/input';

import Argv from './modules/app-argv.js';
import TeraBoxApp from './modules/api.js';

import {
    loadYaml, selectAccount,
} from './modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, './package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (GetShareDL Module)`);
let sRoot = '';

const yargs = new Argv(config, ['a','s']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    try{
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
        
        await getShareDL(yargs.getArgv('s'));
    }
    catch(error){
        console.error(error);
    }
})();

async function getShareDL(argv_surl){    
    const tbUrl = argv_surl ? argv_surl : await input({ message: 'Share URL/SURL:' });
    const regexRUrl = /^\/s\/1([A-Za-z0-9_-]+)$/;
    const regexSUrl = /^[A-Za-z0-9_-]+$/;
    let shareUrl = '';
    
    if(tbUrl.match(regexSUrl)){
        shareUrl = tbUrl;
    }
    if(shareUrl == ''){
        try{
            const sUrl = new URL(tbUrl);
            const sUrlSP = sUrl.searchParams.get('surl');
            if(sUrl.pathname.match(regexRUrl)){
                shareUrl = sUrl.pathname.match(regexRUrl)[1];
            }
            if(sUrl.pathname == '/sharing/link' && typeof sUrlSP == 'string' && sUrlSP.match(regexSUrl)){
                shareUrl = sUrlSP;
            }
            if(shareUrl == ''){
                throw new Error();
            }
        }
        catch(error){
            console.error(':: BAD URL', tbUrl);
        }
    }
    if(shareUrl == ''){
        await getShareDL();
        return;
    }
    
    await app.updateAppData();
    const sFsList = await getRemotePath(shareUrl, '');
    if(sFsList.length > 0){
        const fsList = [];
        for(const f of sFsList){
            fsList.push({
                path: f.path,
                server_filename: f.server_filename,
                dlink: f.dlink + '&origin=dlna',
            });
        }
        await addDownloads(fsList);
    }
};

async function getRemotePath(shareUrl, remoteDir){
    const shareReq = await app.shortUrlList(shareUrl, remoteDir);
    if(shareReq.errno == 0){
        if(sRoot == ''){
            sRoot = shareReq.list[0].path.split('/').slice(0, -1).join('/');
        }
        console.log(':: Got Share:', shareUrl, stripPath(shareReq.title));
        const fileList = [];
        for(const f of shareReq.list){
            if(f.isdir == '1'){
                const subList = await getRemotePath(shareUrl, f.path);
                fileList.push(...subList);
            }
            else{
                fileList.push(f);
            }
        }
        return fileList;
    }
    else{
        return [];
    }
}

function stripPath(rPath){
    return rPath.replace(sRoot, '').replace(new RegExp('^/'), '');
}

async function addDownloads(fsList){
    // aria2c -x 16 -s 10 -j 4 -k 1M --enable-rpc --rpc-allow-origin-all=true --dir=D:/Downloads --rpc-secret=YOUR_ARIA2_RPC_SECRET
    // https://aria2.github.io/manual/en/html/aria2c.html#aria2.addUri
    
    const jsonReq = {
        jsonrpc: '2.0',
        id: 'DOWNLOAD_ID',
        method: 'aria2.addUri',
        params: [ 'token:' + config.aria2.secret ],
    };
    
    const rpcReq = [];
    for(const [i, f] of fsList.entries()){
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
