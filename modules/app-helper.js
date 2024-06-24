import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

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
        console.error('\n[ERROR]', error.message);
    }

    return upload_status;
};

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

        // const uploadedParts = (Math.floor(partSeq/maxTasks) * maxTasks) + '/' + hashes.length;
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

            if(error.cause){
                error.message += ' Cause';
                if(error.cause.errno){
                    error.message += ' #' + error.cause.errno;
                }
                if(error.cause.code){
                    error.message += ' ' + error.cause.code;
                }
            }

            const uplFailedMsg1 = ' -> Upload failed for part #' + (partSeq+1);
            const uplFailedMsg2 = `: ${error.message}`;
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

export { loadJson, saveJson, hashFileChunks, uploadChunks };
