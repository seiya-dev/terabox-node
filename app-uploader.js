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
    hashFileChunks, uploadChunks,
    unwrapErrorMessage,
} from './modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadJson(path.resolve(__dirname, './config.json'));
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
        cur_acc = await selectAccount();
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
    
    if(yargs.getArgv('l') == uploadDir){
        console.log('? Upload Dir:', uploadDir);
    }
    
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
    
    console.log('\n? Remote Dir:', remoteDir);
    
    for(const fi of fsList){
        if(fi.is_dir){
            fi.path = fi.path.replace(/\/$/, '');
            const remoteDirNew = remoteDir + fi.path.split('/').reverse()[0] + '/';
            await uploadDir(fi.path, remoteDirNew);
            continue;
        }
        
        const file = fi.path;
        const filename = path.basename(file);
        
        const findDir = remoteFsList.find(f => {
            return f.isdir == 1 && f.server_filename == filename;
        });
        
        if(findDir){
            console.log(`\n:: Exist dir with same name as file: ${filename}, skipping...`);
            continue;
        }
        
        const findFile = remoteFsList.find(f => {
            return f.isdir == 0 && f.server_filename == filename;
        });
        
        if(findFile){
            console.log(`\n:: File already uploaded: ${filename}, skipping...`);
            continue;
        }
        
        const index = fsList.indexOf(fi) + 1;
        console.log(`\n:: Processing: [${index}/${fsList.length}] ${filename}`);
        
        const tbtempfile = file + '.tbtemp';
        const data = loadJson(tbtempfile);
        delete data.error;
        
        if(!data.upload_id){
            data.upload_id = '';
        }
        if(!data.remote_dir){
            data.remote_dir = remoteDir;
        }
    
        if(!data.hashes){
            console.log(':: Calculating hashes...');
            data.hashes = await hashFileChunks(file);
        }
    
        // convert hashes to string
        const hashes_json = JSON.stringify(data.hashes);
    
        console.log(`:: Precreate file...`);
        await app.updateAppData();
        let preCreateData = {};
    
        try{
            preCreateData = await app.precreateFile(data.upload_id, data.remote_dir, filename, hashes_json);
            if(preCreateData.errno == 0){
                data.upload_id = preCreateData.uploadid;
                saveJson(tbtempfile, data);
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
    
        // generate uploaded flags
        data.uploaded = new Array(data.hashes.length).fill(true);
        for(const uBlock of preCreateData.block_list){
            data.uploaded[uBlock] = false;
        }
    
        console.log(`:: Upload chunks...`)
        const upload_status = await uploadChunks(app, data, file);
        console.log(); // reset stdout after process.write
        delete data.uploaded;
    
        if(upload_status.ok){
            try{
                console.log(`:: Create file...`);
                await app.updateAppData();
                const upload_info = await app.createFile(data.remote_dir, filename, data.upload_id, upload_status.size, hashes_json);
    
                console.log(`:: Uploaded:`);
                console.log('File:', upload_info.path.split('/').reverse()[0]);
                if(upload_info.errno == 0){
                    try{
                        fs.unlinkSync(tbtempfile);
                    }
                    catch(error){
                        console.error('[ERROR] Can\'t remove temp file:', unwrapErrorMessage(error));
                    }
                }
            }
            catch(error){
                console.error('[ERROR] Can\'t save file to remote:', unwrapErrorMessage(error));
            }
        }
    }
}
