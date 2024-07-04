import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

import input from '@inquirer/input';
import select from '@inquirer/select';
import dateFormat from 'dateformat';
import { filesize } from 'filesize';

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
    
    const reg_country = acc_data.data.reg_country.name;
    console.info('[INFO] USER:', acc_info.data.display_name, '/ Reg Country:', reg_country);
    
    const spaceUsed = filesize(acc_quota.used, {standard: 'iec', round: 3, pad: true});
    const spaceTotal = filesize(acc_quota.total, {standard: 'iec', round: 3, pad: true});
    const spaceFree = filesize(acc_quota.available, {standard: 'iec', round: 3, pad: true});
    console.info('[INFO] Space:', spaceFree, '/', spaceTotal, '[FREE / TOTAL]');
    
    const is_vip = acc_data.data.member_info.is_vip;
    const vip_end_time = acc_data.data.member_info.vip_end_time * 1000;
    const vip_left_time = Math.ceil(acc_data.data.member_info.vip_left_time / (24*60*60));
    
    if(is_vip == 1){ 
        const vip_end_date = dateFormat(vip_end_time, 'UTC:yyyy-mm-dd');
        console.info('[INFO] VIP: End on', vip_end_date, '/', vip_left_time, 'days left'); 
    }
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
    remoteDir = '/' + remoteDir.split('/').map(v => cleanupName(v)).join('/');
    remoteDir = remoteDir.replace(/\/+/g, '/');
    if(remoteDir != '/' && remoteDir.match(/\/$/)){
        remoteDir = remoteDir.replace(/\/$/, '');
    }
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

function getChunkSize(fileSize) {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    
    const limitSizes = [4, 8, 16, 32, 64, 128];
    
    for (const limit of limitSizes) {
        if (fileSize <= limit * GiB) {
            return limit * MiB;
        }
    }
    
    return limitSizes.at(-1) * MiB;
}

const crcTable = (() => {
    const table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c;
    }
    return table;
})();

class createHashCRC {
    constructor() {
        this.crcHash = -1;
    }
    update(data){
        for (let i = 0; i < data.length; i++) {
            this.crcHash = (this.crcHash >>> 8) ^ crcTable[(this.crcHash ^ data[i]) & 0xFF];
        }
    }
    digest(type){
        const finalCrcHash = (this.crcHash ^ (-1)) >>> 0;
        if(type == 'hex'){
            return finalCrcHash.toString(16);
        }
        return finalCrcHash;
    }
}

async function hashFile(filePath) {
    const stat = fs.statSync(filePath);
    const splitSize = getChunkSize(stat.size);
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        
        const hashData = {
            file: '', 
            slice: '', 
            crc32: 0, 
            chunks: []
        };
        
        const sliceSize = 256 * 1024;
        
        const fileHash = crypto.createHash('md5');
        const sliceHash = crypto.createHash('md5');
        const crcHash = new createHashCRC();
        let chunkHash = crypto.createHash('md5');
        
        let bytesRead = 0;
        let allBytesRead = 0;
        fileStream.on('data', (data) => {
            fileHash.update(data);
            crcHash.update(data);
            
            let offset = 0;
            while (offset < data.length) {
                let remainingBytes = splitSize - bytesRead;
                if (allBytesRead < sliceSize) {
                    remainingBytes = Math.min(sliceSize - allBytesRead, remainingBytes);
                }
                
                const end = offset + remainingBytes > data.length ? data.length : offset + remainingBytes;
                const chunk = data.subarray(offset, end);
                chunkHash.update(chunk);
                
                allBytesRead += end - offset;
                bytesRead += end - offset;
                offset = end;
                
                if (allBytesRead <= sliceSize) {
                    sliceHash.update(chunk);
                }
                
                if (bytesRead >= splitSize) {
                    hashData.chunks.push(chunkHash.digest('hex'));
                    chunkHash = crypto.createHash('md5');
                    bytesRead = 0;
                }
            }
        });
        
        fileStream.on('end', () => {
            hashData.file = fileHash.digest('hex');
            hashData.slice = sliceHash.digest('hex');
            hashData.crc32 = crcHash.digest('dec');
            if (bytesRead > 0) {
                hashData.chunks.push(chunkHash.digest('hex'));
            }
            
            resolve(hashData);
        });
        
        fileStream.on('error', reject);
    });
}

async function runWithConcurrencyLimit(tasks, limit) {
    let index = 0;
    let failed = false;
    
    const runTask = async () => {
        while (index < tasks.length && !failed) {
            const currentIndex = index++;
            const result = await tasks[currentIndex]();
        }
    };
    
    const workers = Array.from({ length: limit }, () => runTask());
    
    try{
        await Promise.all(workers);
        return true;
    }
    catch(error){
        console.error('\n[ERROR]', unwrapErrorMessage(error));
        failed = true;
        return false;
    }
};

function printUploadLog(uploadedData, fsize){
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0, null);
    
    const uploadedBytesSum = Object.values(uploadedData.parts).reduce((acc, value) => acc + value, 0);
    const uploadedBytesStr = filesize(uploadedBytesSum, {standard: 'iec', round: 3, pad: true});
    const filesizeBytesStr = filesize(fsize, {standard: 'iec', round: 3, pad: true});
    const uploadedBytesFStr = `(${uploadedBytesStr}/${filesizeBytesStr})`;
    
    const uploadSpeed = uploadedData.all * 1000 / (Date.now() - uploadedData.start);
    const uploadSpeedStr = filesize(uploadSpeed, {standard: 'si', round: 2, pad: true}) + '/s';
    
    const remainingTime = Math.max((fsize - uploadedBytesSum) / uploadSpeed, 0);
    const remainingSeconds = Math.floor(remainingTime % 60);
    const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
    const remainingHours = Math.floor(remainingTime / 3600);
    const [remH, remM, remS] = [remainingHours, remainingMinutes, remainingSeconds].map(t => String(t).padStart(2, '0'));
    const remainingTimeStr = `${remH}h${remM}m${remS}s left...`;
    
    const percentage = Math.round((uploadedBytesSum / fsize) * 100);
    const percentageFStr = `${percentage}% ${uploadedBytesFStr}`;
    const uploadStatusArr = [percentageFStr, uploadSpeedStr, remainingTimeStr];
    process.stdout.write(`Uploading: ${uploadStatusArr.join(', ')}`);
}

async function uploadChunkTask(app, data, filePath, partSeq, uploadedData, externalAbort) {
    const splitSize = getChunkSize(data.size);
    const start = partSeq * splitSize;
    const end = Math.min(start + splitSize, data.size) - 1;
    
    const onBodySent = (chunk) => {
        if (externalAbort.aborted) {
            return;
        }
        uploadedData.all += chunk.length;
        uploadedData.parts[partSeq] += chunk.length;
        
        printUploadLog(uploadedData, data.size);
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
            const r = await app.uploadChunk(data, partSeq, blob, onBodySent, externalAbort);
            return { part: partSeq, r, done: true };
            break;
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
    const splitSize = getChunkSize(data.size);
    const totalChunks = data.hash.chunks.length;
    
    const externalAbortController = new AbortController();
    
    const tasks = [];
    const uploadedData = {
        all: 0,
        start: Date.now(),
        parts: {},
    };
    
    if(data.uploaded.filter(pStatus => pStatus == false).length > 0){
        for (let partSeq = 0; partSeq < totalChunks; partSeq++) {
            if(data.uploaded[partSeq]){
                uploadedData.parts[partSeq] = splitSize;
            }
        }
        
        for (let partSeq = 0; partSeq < totalChunks; partSeq++) {
            if(!data.uploaded[partSeq]){
                tasks.push(() => {
                    return uploadChunkTask(app, data, filePath, partSeq, uploadedData, externalAbortController.signal);
                });
            }
        }
        
        const upload_status = await runWithConcurrencyLimit(tasks, maxTasks);
        externalAbortController.abort();
        return upload_status;
    }
    
    return true;
}

async function uploadFile(app, data, filePath){
    const uploadedData = {
        all: 0,
        start: Date.now(),
        parts: {},
    };
    
    const onBodySent = (chunk) => {
        uploadedData.all += chunk.length;
        uploadedData.parts[0] += chunk.length;
        
        printUploadLog(uploadedData, data.size);
    }
    
    for (let i = 0; i < maxTries; i++) {
        
        uploadedData.parts[0] = 0;
        const chunk = fs.createReadStream(filePath);
        const blob = {
            type: 'application/octet-stream',
            name: 'file',
            [Symbol.toStringTag]: 'Blob',
            size: data.size,
            stream() {
                return chunk
            }
        }
        
        try{
            const r = await app.uploadChunk(data, 0, blob, onBodySent);
            return { r, done: true };
            break;
        }
        catch(error){
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
            
            const uplFailedMsg1 = ' -> Upload failed';
            const uplFailedMsg2 = `: ${message}`;
            const doRetry = i+1 != maxTries ? `, retry #${i+1}` : '';
            
            process.stdout.write(uplFailedMsg1 + uplFailedMsg2 + doRetry + '...\n');
        }
    }
    
    return { done: false };
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
    uploadChunks, uploadFile,
    hashFile, getChunkSize,
    unwrapErrorMessage
};
