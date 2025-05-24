import fs from 'node:fs';
import path from 'node:path';

import input from '@inquirer/input';
import select from '@inquirer/select';

import dateFormat from 'dateformat';
import { filesize } from 'filesize';

import YAML from 'yaml';

async function delay(ms){
    if(ms < 1){
        return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
}

function loadYaml(file){
    try{
        const data = fs.readFileSync(file, 'utf8');
        return YAML.parse(data);
    }
    catch(e){
        return { error: e };
    }
}

function saveYaml(file, data){
    fs.writeFileSync(file, YAML.stringify(data, {lineWidth: 0}));
}

async function selectAccount(config){
    const accounts = [];
    for(const a of Object.keys(config.accounts)){
        accounts.push({
            name: a,
            value: config.accounts[a],
        });
    }
    const answer = await select({
        message: '[INFO] Select Account:',
        choices: accounts,
    });
    return answer;
}

async function showAccountInfo(app){
    const acc_info = await app.getPassport();
    const acc_data = await app.getAccountData();
    const acc_quota = await app.getQuota();
    
    console.info('[INFO] USER:', acc_info.data.display_name);
    
    const spaceUsed = filesize(acc_quota.used, {standard: 'iec', round: 3, pad: true});
    const spaceTotal = filesize(acc_quota.total, {standard: 'iec', round: 3, pad: true});
    const spaceFree = filesize(acc_quota.available, {standard: 'iec', round: 3, pad: true});
    console.info('[INFO] Space:', spaceFree, '/', spaceTotal, '[FREE / TOTAL]');
    
    const vip_end_time = acc_data.data.member_info.vip_end_time * 1000;
    const vip_left_time = Math.floor(acc_data.data.member_info.vip_left_time / (24*60*60));
    
    if(app.params.is_vip){
        const vip_end_date = dateFormat(vip_end_time, 'UTC:yyyy-mm-dd');
        console.info('[INFO] VIP: End on', vip_end_date, '/', vip_left_time, 'days left'); 
    }
}

async function selectLocalPath(inputPath){
    let answer = inputPath;
    if(typeof answer != 'string' || answer == ''){
        answer = await input({ message: 'Local Path:' });
    }
    answer = answer.replace(/^"(.*)"$/, '$1');
    try{
        if(fs.statSync(answer).isDirectory()){
            return path.resolve(answer);
        }
        else{
            return await selectLocalPath();
        }
    }
    catch(error){
        return await selectLocalPath();
    }
}

async function selectRemotePath(remotePath){
    try{
        remotePath = await cleanupRemotePath(remotePath);
        return remotePath;
    }
    catch(e){
        return selectRemotePath(remotePath);
    }
}

async function cleanupRemotePath(remotePath){
    if(typeof remotePath != 'string' || remotePath == ''){
        remotePath = await input({ message: 'Remote Path:' });
        if(remotePath == ''){
            return await cleanupRemotePath(remotePath);
        }
    }
    if(remotePath.match(/^root/)){
        remotePath = remotePath.replace(/^root/, '');
    }
    remotePath = '/' + remotePath.split('/').map(v => cleanupName(v)).join('/');
    remotePath = remotePath.replace(/\/+/g, '/');
    if(remotePath != '/' && remotePath.match(/\/$/)){
        remotePath = remotePath.replace(/\/$/, '');
    }
    return remotePath;
}

function cleanupName(fsName) {
    const fixingChar = '';
    const illegalRe = /[\/\?<>\\:\*\|":]/g; // Illegal Characters on conscious Operating Systems: / ? < > \ : * | "
    const controlRe = /[\x00-\x1f\x80-\x9f]/g; // Unicode Control codes: C0 0x00-0x1f & C1 (0x80-0x9f)
    const reservedRe = /^\.+$/; // Reserved filenames on Unix-based systems (".", "..")
    const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    /*    Reserved filenames in Windows ("CON", "PRN", "AUX", "NUL", "COM1",
        "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", and
        "LPT9") case-insensitively and with or without filename extensions. */
    const windowsTrailingRe = /[\. ]+$/;
    fsName = fsName
        .replace(illegalRe, fixingChar)
        .replace(controlRe, fixingChar)
        .replace(reservedRe, fixingChar)
        .replace(windowsReservedRe, fixingChar)
        .replace(windowsTrailingRe, fixingChar);
    return fsName;
}

function scanLocalPath(localPath){
    try{
        const blackListRegex = /(^\..*|\.!qB|\.part|\.tbtemp|\.temp|\.downloading)$/i;
        const fsList = fs.readdirSync(localPath, {withFileTypes: true})
            .filter(item => !item.name.match(blackListRegex))
            .map(item => { return { is_dir: item.isDirectory(), path: path.resolve(item.parentPath, item.name).replace(/\\+/g, '/'), }})
            .sort((a, b) => {if(a.is_dir && !b.is_dir){return 1;}if(!a.is_dir && b.is_dir){return -1;}return 0;});
        return fsList;
    }
    catch(error){
        return [];
    }
}

export {
    delay,
    loadYaml,
    saveYaml,
    selectAccount,
    showAccountInfo,
    selectLocalPath,
    selectRemotePath,
    scanLocalPath,
}
