import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

import input from '@inquirer/input';
import select from '@inquirer/select';
import dateFormat from 'dateformat';
import { filesize } from 'filesize';

const vipMaxFile   = 20 * Math.pow(1024, 3); // 20 GiB
const novipMaxFile =  4 * Math.pow(1024, 3); // 4 GiB

const chunkSize    =  4 * Math.pow(1024, 2); // 4 MiB
const bigChunkSize =  8 * Math.pow(1024, 2); // 8 MiB

const maxTasks = 10;
const maxTries = 5;

function loadJson(file){
    try{
        const data = fs.readFileSync(file);
        return JSON.parse(data);
    }
    catch(e){
        return { error: e };
    }
}

function saveJson(file, data){
    fs.writeFileSync(file, JSON.stringify(data));
}

async function selectAccount(config){
    const accounts = [];
    for(const a of Object.keys(config.accounts)){
        accounts.push({
            name: a,
            value: config.accounts[a]
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
    console.info('[INFO] USER:', acc_info.data.display_name);
    const acc_data = await app.getAccountData();
    const is_vip = acc_data.data.member_info.is_vip;
    const vip_end_time = acc_data.data.member_info.vip_end_time * 1000;
    console.info('[INFO] VIP:', `You are a ${is_vip == 1 ? 'vip' : 'non-vip'} user.`);
    if(is_vip == 1){ console.info('[INFO] VIP: End on', dateFormat(vip_end_time, 'UTC:yyyy-mm-dd HH:MM:ss'), 'UTC'); }
}

async function selectLocalDir(inputDir){
    let answer = inputDir;
    if(typeof answer != 'string' || answer == ''){
        answer = await input({ message: 'Local Dir:' });
    }
    answer = answer.replace(/^"(.*)"$/, '$1');
    try{
        if(fs.statSync(answer).isDirectory()){
            return path.resolve(answer);
        }
        else{
            return await selectDir();
        }
    }
    catch(e){
        return await selectDir();
    }
}

async function selectRemoteDir(remoteDir){
    try{
        remoteDir = await cleanupRemotePath(remoteDir);
        return remoteDir;
    }
    catch(e){
        return selectRemoteDir(remoteDir);
    }
}

async function cleanupRemotePath(remoteDir){
    if(typeof remoteDir != 'string' || remoteDir == ''){
        remoteDir = await input({ message: 'Remote Dir:' });
        if(remoteDir == ''){
            return await cleanupRemotePath(remoteDir);
        }
    }
    if(remoteDir.match(/^root/)){
        remoteDir = remoteDir.replace(/^root/, '');
    }
    if(!remoteDir.match(/\/$/)){
        remoteDir += '/';
    }
    remoteDir = '/' + remoteDir.split('/').map(v => cleanupName(v)).join('/');
    remoteDir = remoteDir.replace(/\/+/g, '/');
    return remoteDir;
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

async function askRemoteDir(){
    return await input({ message: 'Remote Dir:' });
}

async function hashFileChunks(filePath) {
    const stat = fs.statSync(filePath);
    const splitSize = stat.size > novipMaxFile ? bigChunkSize : chunkSize;
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        const hashes = [];
        let currentHash = crypto.createHash('md5');
        let bytesRead = 0;
        
        fileStream.on('data', (chunk) => {
            let offset = 0;
            while (offset < chunk.length) {
                const remainingBytes = splitSize - bytesRead;
                const end = offset + remainingBytes > chunk.length ? chunk.length : offset + remainingBytes;
                currentHash.update(chunk.slice(offset, end));
                bytesRead += end - offset;
                offset = end;
                
                if (bytesRead >= splitSize) {
                    hashes.push(currentHash.digest('hex'));
                    currentHash = crypto.createHash('md5');
                    bytesRead = 0;
                }
            }
        });
        
        fileStream.on('end', () => {
            if (bytesRead > 0) {
                hashes.push(currentHash.digest('hex'));
            }
            resolve(hashes);
        });
        
        fileStream.on('error', reject);
    });
}

async function runWithConcurrencyLimit(size, uploaded, tasks, limit) {
    const upload_status = {};
    upload_status.ok = false;
    upload_status.size = size;
    upload_status.uploaded = uploaded;
    
    let index = 0;
    let failed = false;
    
    const runTask = async () => {
        while (index < tasks.length && !failed) {
            const currentIndex = index++;
            const result = await tasks[currentIndex]();
            if(result){
                upload_status.uploaded[result.part] = result.done;
            }
        }
    };
    
    const workers = Array.from({ length: limit }, () => runTask());
    
    try{
        await Promise.all(workers);
        upload_status.ok = true;
    }
    catch(error){
        failed = true;
        console.error('\n[ERROR]', unwrapErrorMessage(error));
    }

    return upload_status;
};

async function uploadChunkTask(app, remoteDir, filename, filePath, uploadid, hashes, stat, partSeq, uploadedData, externalAbort) {
    const splitSize = stat.size > novipMaxFile ? bigChunkSize : chunkSize;
    const start = partSeq * splitSize;
    const end = Math.min(start + splitSize, stat.size) - 1;
    
    const onBodySent = (chunk) => {
        if (externalAbort.aborted) {
            return;
        }
        
        uploadedData.all += chunk.length;
        uploadedData.parts[partSeq] += chunk.length;
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0, null);
        
        const uploadedBytesSum = Object.values(uploadedData.parts).reduce((acc, value) => acc + value, 0);
        const uploadedBytesStr = filesize(uploadedBytesSum, {standard: 'iec', round: 3, pad: true});
        const filesizeBytesStr = filesize(stat.size, {standard: 'iec', round: 3, pad: true});
        const uploadSpeed = uploadedData.all * 1000 / (Date.now() - uploadedData.start);
        const uploadSpeedStr = filesize(uploadSpeed, {standard: 'si', round: 2, pad: true}) + '/s';
        
        const remainingTime = Math.max((stat.size - uploadedBytesSum) / uploadSpeed, 0);
        const remainingSeconds = Math.floor(remainingTime % 60);
        const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
        const remainingHours = Math.floor(remainingTime / 3600);
        const [remH, remM, remS] = [remainingHours, remainingMinutes, remainingSeconds].map(t => String(t).padStart(2, '0'))
        
        const percentage = Math.round((uploadedBytesSum / stat.size) * 100);
        process.stdout.write(`Uploading: ${percentage}% (${uploadedBytesStr}/${filesizeBytesStr}) ${uploadSpeedStr}, ${remH}h${remM}m${remS}s left...`);
    }
    
    for (let i = 0; i < maxTries; i++) {
        if (externalAbort.aborted) {
            break;
        }
        
        uploadedData.parts[partSeq] = 0;
        const chunk = fs.createReadStream(filePath, {start, end});
        const blob = {
            type: 'application/octet-stream',
            name: 'file',
            [Symbol.toStringTag]: 'Blob',
            size: end-start+1,
            stream() {
                return chunk
            }
        }
        
        try{
            await app.uploadChunk(remoteDir, filename, blob, uploadid, hashes[partSeq], partSeq, onBodySent, externalAbort);
            return { part: partSeq, done: true };
        }
        catch(error){
            if (externalAbort.aborted) {
                break;
            }
            
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0, null);
            
            let message = error.message;
            if(error.cause){
                message += ' Cause';
                if(error.cause.errno){
                    message += ' #' + error.cause.errno;
                }
                if(error.cause.code){
                    message += ' ' + error.cause.code;
                }
            }
            
            const uplFailedMsg1 = ' -> Upload failed for part #' + (partSeq+1);
            const uplFailedMsg2 = `: ${message}`;
            const doRetry = i+1 != maxTries ? `, retry #${i+1}` : '';
            
            process.stdout.write(uplFailedMsg1 + uplFailedMsg2 + doRetry + '...\n');
        }
    }
    
    throw new Error(`Upload failed! [PART #${partSeq+1}]`);
}

async function uploadChunks(app, data, filePath) {
    const filename = path.basename(filePath);
    const file = await fsPromises.open(filePath);
    const stat = await file.stat();
    const splitSize = stat.size > novipMaxFile ? bigChunkSize : chunkSize;
    const totalChunks = Math.ceil(stat.size / splitSize);
    await file.close();
    
    const externalAbortController = new AbortController();

    const tasks = [];
    const uploadedData = {
        start: Date.now(),
        all: 0,
        parts: {},
    };
    
    let upload_status;
    if(data.uploaded.filter((pStatus) => pStatus == false).length > 0){
        for (let partSeq = 0; partSeq < totalChunks; partSeq++) {
            if(data.uploaded[partSeq]){
                uploadedData.parts[partSeq] = splitSize;
            }
        }
        
        for (let partSeq = 0; partSeq < totalChunks; partSeq++) {
            if(!data.uploaded[partSeq]){
                tasks.push(() => {
                    return uploadChunkTask(app, data.remote_dir, filename, filePath, data.upload_id, data.hashes, stat, partSeq, uploadedData, externalAbortController.signal);
                });
            }
        }
        
        upload_status = await runWithConcurrencyLimit(stat.size, data.uploaded, tasks, maxTasks);
        externalAbortController.abort();
    }
    else{
        upload_status = {
            ok: true,
            size: stat.size,
            uploaded: data.uploaded,
        };
    }

    return upload_status;
}

function unwrapErrorMessage(err) {
    if (!err) {
        return;
    }

    let e = err;
    let res = err.message;
    while (e.cause) {
        e = e.cause;
        if (e.message) {
            res += ': ' + e.message;
        }
    }

    return res;
}

export {
    loadJson, saveJson,
    selectAccount, showAccountInfo,
    selectLocalDir, selectRemoteDir,
    hashFileChunks, uploadChunks,
    unwrapErrorMessage
};
