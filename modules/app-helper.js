import fs from 'node:fs';

import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

import input from '@inquirer/input';
import select from '@inquirer/select';
import dateFormat from 'dateformat';
import { filesize } from 'filesize';
import YAML from 'yaml';

const maxTasks = 10;
const maxTries = 5;

async function delay(ms){
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
        const blackListRegex = /(^\..*|\.!qB|\.part|\.tbtemp|\.temp|\.downloading)$/;
        const fsList = fs.readdirSync(localPath, {withFileTypes: true})
            .filter(item => !item.name.match(blackListRegex))
            .map(item => { return { is_dir: item.isDirectory(), path: path.resolve(item.path, item.name).replace(/\\+/g, '/'), }})
            .sort((a, b) => {if(a.is_dir && !b.is_dir){return 1;}if(!a.is_dir && b.is_dir){return -1;}return 0;});
        return fsList;
    }
    catch(error){
        return [];
    }
}

function getChunkSize(fileSize, is_vip = true) {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    
    const limitSizes = [4, 8, 16, 32, 64, 128];
    
    if(!is_vip){
        return limitSizes.at(0) * MiB;
    }
    
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

class cryptoCreateHashCRC {
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
            return finalCrcHash.toString(16).toUpperCase().padStart(8, '0');
        }
        if(type == 'dec'){
            return finalCrcHash;
        }
        return finalCrcHash;
    }
}

async function hashFile(filePath, skipChunks) {
    const stat = fs.statSync(filePath);
    const sliceSize = 256 * 1024;
    const splitSize = getChunkSize(stat.size);
    const hashedData = newProgressData();
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        
        const hashData = {
            crc32: 0,
            slice: '',
            file: '',
            chunks: []
        };
        
        // create hash processes
        const crcHash = new cryptoCreateHashCRC();
        const sliceHash = crypto.createHash('md5');
        const fileHash = crypto.createHash('md5');
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
                
                if (!skipChunks) {
                    chunkHash.update(chunk);
                }
                
                allBytesRead += end - offset;
                bytesRead += end - offset;
                offset = end;
                
                if (!skipChunks && allBytesRead <= sliceSize) {
                    sliceHash.update(chunk);
                }
                
                if (!skipChunks && bytesRead >= splitSize) {
                    hashData.chunks.push(chunkHash.digest('hex'));
                    chunkHash = crypto.createHash('md5');
                    bytesRead = 0;
                }
            }
            
            hashedData.all = hashedData.parts[0] = allBytesRead;
            printProgressLog('Hashing', hashedData, stat.size);
        });
        
        fileStream.on('end', () => {
            hashData.crc32 = crcHash.digest('dec');
            hashData.slice = sliceHash.digest('hex');
            hashData.file = fileHash.digest('hex');
            
            if (!skipChunks && bytesRead > 0) {
                hashData.chunks.push(chunkHash.digest('hex'));
            }
            if (skipChunks) {
                delete hashData.chunks;
            }
            
            console.log();
            resolve(hashData);
        });
        
        fileStream.on('error', (error) => {
            console.log();
            reject(error);
        });
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

function printProgressLog(prepText, uploadedData, fsize){
    readline.cursorTo(process.stdout, 0, null);
    
    const uploadedBytesSum = Object.values(uploadedData.parts).reduce((acc, value) => acc + value, 0);
    const uploadedBytesStr = filesize(uploadedBytesSum, {standard: 'iec', round: 3, pad: true, separator: '.'});
    const filesizeBytesStr = filesize(fsize, {standard: 'iec', round: 3, pad: true});
    const uploadedBytesFStr = `(${uploadedBytesStr}/${filesizeBytesStr})`;
    
    const uploadSpeed = uploadedData.all * 1000 / (Date.now() - uploadedData.start);
    const uploadSpeedStr = filesize(uploadSpeed, {standard: 'si', round: 2, pad: true, separator: '.'}) + '/s';
    
    const remainingTime = Math.max((fsize - uploadedBytesSum) / uploadSpeed, 0);
    const remainingSeconds = Math.floor(remainingTime % 60);
    const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
    const remainingHours = Math.floor(remainingTime / 3600);
    const [remH, remM, remS] = [remainingHours, remainingMinutes, remainingSeconds].map(t => String(t).padStart(2, '0'));
    const remainingTimeStr = `${remH}h${remM}m${remS}s left...`;
    
    const percentage = Math.floor((uploadedBytesSum / fsize) * 100);
    const percentageFStr = `${percentage}% ${uploadedBytesFStr}`;
    const uploadStatusArr = [percentageFStr, uploadSpeedStr, remainingTimeStr];
    process.stdout.write(`${prepText}: ${uploadStatusArr.join(', ')}`);
    readline.clearLine(process.stdout, 1);
}

async function uploadChunkTask(app, data, filePath, partSeq, uploadedData, externalAbort) {
    const splitSize = getChunkSize(data.size);
    const start = partSeq * splitSize;
    const end = Math.min(start + splitSize, data.size) - 1;
    
    const onBodySentHandler = (chunkSize) => {
        if (externalAbort.aborted) {
            return;
        }
        uploadedData.all += chunkSize;
        uploadedData.parts[partSeq] += chunkSize;
        
        printProgressLog('Uploading', uploadedData, data.size);
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
            const r = await app.uploadChunk(data, partSeq, blob, onBodySentHandler, externalAbort);
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

function newProgressData() {
    return {
        all: 0,
        start: Date.now(),
        parts: {},
    }
}

async function uploadChunks(app, data, filePath) {
    const splitSize = getChunkSize(data.size);
    const totalChunks = data.hash.chunks.length;
    const lastChunkSize = data.size - splitSize * (data.hash.chunks.length - 1);
    
    const tasks = [];
    const uploadedData = newProgressData();
    const externalAbortController = new AbortController();
    
    if(data.uploaded.filter(pStatus => pStatus == false).length > 0){
        for (let partSeq = 0; partSeq < totalChunks; partSeq++) {
            if(data.uploaded[partSeq]){
                const chunkSize = partSeq < totalChunks - 1 ? splitSize : lastChunkSize;
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
        
        const cMaxTasks = totalChunks > 1 ? maxTasks : 1;
        const upload_status = await runWithConcurrencyLimit(tasks, cMaxTasks);
        console.log(); // reset stdout after process.write
        externalAbortController.abort();
        return upload_status;
    }
    
    return true;
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
    delay,
    loadYaml,
    saveYaml,
    selectAccount,
    showAccountInfo,
    selectLocalPath,
    selectRemotePath,
    scanLocalPath,
    getChunkSize,
    hashFile,
    uploadChunks,
    unwrapErrorMessage,
};
