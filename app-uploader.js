//#nodejs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import Argv from './modules/app-argv.js';
import TeraBoxApp from './modules/api.js';

import {
    loadJson, saveJson,
    selectAccount, showAccountInfo,
    selectLocalDir, selectRemoteDir,
    hashFile, uploadChunks,
    unwrapErrorMessage,
} from './modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadJson(path.resolve(__dirname, './.config.json'));
const meta = loadJson(path.resolve(__dirname, './package.json'));

console.log('[INFO] TeraBox App', 'v' + meta.version, '(Uploader Module)');

const yargs = new Argv(config);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
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
    
    await showAccountInfo(app);
    await selectDirs();
})();

async function selectDirs(){
    const localDir = await selectLocalDir(yargs.getArgv('l'));
    const remoteDir = await selectRemoteDir(yargs.getArgv('r'));
    
    await uploadDir(localDir, remoteDir);
    console.log('\n:: Done!\n');
}

async function uploadDir(localDir, remoteDir){
    const fsList = fs.readdirSync(localDir, {withFileTypes: true})
        .filter(item => !item.name.match(/^\..*$/) && !item.name.match(/\.tbtemp$/) && !item.name.match(/\.!qB$/))
        .map(item => { return { is_dir: item.isDirectory(), path: path.resolve(item.path, item.name).replace(/\\+/g, '/'), }})
        .sort((a, b) => {if(a.is_dir && !b.is_dir){return 1;}if(!a.is_dir && b.is_dir){return -1;}return 0;});
    
    let remoteFsList = [];
    try {
        const reqRemoteDir = await app.getRemoteDir(remoteDir);
        if(reqRemoteDir.errno == 0){
            remoteFsList = reqRemoteDir.list;
        }
        else{
            await app.updateAppData();
            const remoteDirData = await app.createFolder(remoteDir);
            if(remoteDirData.errno != 0){
                const e = new Error('BAD Response');
                e.data = remoteDirData;
                throw e;
            }
        }
    }
    catch(e){
        console.error('[ERROR] Failed to fetch remote dir:', remoteDir);
        console.error(e);
        return;
    }
    
    console.log('\n? Local Dir:', localDir);
    console.log('? Remote Dir:', remoteDir);
    const fsListFiles = fsList.filter(item => !item.is_dir);
    
    for(const fi of fsList){
        if(fi.is_dir){
            fi.path = fi.path.replace(/\/$/, '');
            const remoteDirNew = remoteDir + fi.path.split('/').reverse()[0] + '/';
            await uploadDir(fi.path, remoteDirNew);
            continue;
        }
        
        const filePath = fi.path;
        const tbtempfile = filePath + '.tbtemp';
        const data = loadJson(tbtempfile);
        delete data.error;
        
        if(!data.upload_id){
            data.upload_id = '';
        }
        if(!data.remote_dir){
            data.remote_dir = remoteDir;
        }
        
        data.file = path.basename(filePath);
        data.size = fs.statSync(filePath).size;
        
        const index = fsListFiles.indexOf(fi) + 1;
        const indexStr = `${index}/${fsListFiles.length}`;
        
        console.log(`\n:: Processing: [${indexStr}] ${data.file}`);
        
        const findRemote = remoteFsList.find(f => {
            return f.server_filename == data.file;
        });
        
        if(findRemote){
            console.log(`:: On Remote server Folder or File exist with same name, skipping...`);
            continue;
        }
        
        if(!data.hash || !data.hashes){
            console.log(':: Calculating hashes...');
            const fHashes = await hashFile(filePath);
            data.hash = fHashes.file;
            data.hashes = fHashes.chunks;
        }
        
        // convert hashes to string
        const hashes_json = JSON.stringify(data.hashes);
        
        console.log(`:: Precreate file...`);
        await app.updateAppData();
        
        try{
            const preCreateData = await app.precreateFile(data, hashes_json);
            if(preCreateData.errno == 0){
                // save new upload id
                data.upload_id = preCreateData.uploadid;
                saveJson(tbtempfile, data);
                // fill uploaded data temporary
                data.uploaded = new Array(data.hashes.length).fill(true);
                for(const uBlock of preCreateData.block_list){
                    data.uploaded[uBlock] = false;
                }
            }
            else{
                console.error('[ERROR] Can\'t precreate file:\n', preCreateData);
                continue;
            }
        }
        catch(error){
            console.error('[ERROR] Can\'t precreate file:', error);
            continue;
        }
        
        console.log(`:: Upload chunks...`)
        const upload_status = await uploadChunks(app, data, filePath);
        console.log(); // reset stdout after process.write
        delete data.uploaded;
        
        if(upload_status){
            try{
                console.log(`:: Create file...`);
                await app.updateAppData();
                const upload_info = await app.createFile(data, hashes_json);
                
                if(upload_info.errno == 0){
                    console.log(`:: Uploaded:`);
                    console.log('File:', upload_info.name.split('/').reverse()[0]);
                    console.log('MD5:', upload_info.md5);
                    // console.log(upload_info);
                    try{
                        fs.unlinkSync(tbtempfile);
                    }
                    catch(error){
                        console.error('[ERROR] Can\'t remove temp file:', unwrapErrorMessage(error));
                    }
                }
                else{
                    console.log(`:: Failed to create file on Remote server:`);
                    console.log(upload_info);
                }
            }
            catch(error){
                console.error('[ERROR] Can\'t save file to remote:', unwrapErrorMessage(error));
            }
        }
    }
}
