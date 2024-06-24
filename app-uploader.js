//#nodejs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import input from '@inquirer/input';
import select from '@inquirer/select';
import dateFormat from 'dateformat';

import Argv from './modules/app-argv.js';
import TeraBoxApp from './modules/api.js';
import { loadJson, saveJson, hashFileChunks, uploadChunks } from './modules/app-helper.js';

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
        console.error('[ERROR] Auth key is BAD!');
        return;
    }

    const acc_info = await app.getPassport();
    console.info('[INFO] USER:', acc_info.data.display_name);
    const acc_data = await app.getAccountData();
    const vip = acc_data.data.member_info.is_vip;
    const vipEnd = acc_data.data.member_info.vip_end_time * 1000;
    console.info('[INFO] VIP:', `You are a ${vip == 1 ? 'vip' : 'non-vip'} user.`);
    if(vip == 1){ console.info('[INFO] VIP: End on', dateFormat(vipEnd, 'UTC:yyyy-mm-dd HH:MM:ss'), 'UTC'); }

    await uploadDirContent();

})();

async function selectAccount(){
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

async function selectDir(inputDir){
    let answer = inputDir;
    if(typeof answer != 'string' || answer == ''){
        answer = await input({ message: 'Upload Dir:' });
    }
    answer = answer.replace(/^"(.*)"$/, '$1');
    try{
        if(fs.statSync(answer).isDirectory()){
            return answer;
        }
        else{
            return await selectDir('');
        }
    }
    catch(e){
        return await selectDir('');
    }
}

async function selectRemoteDir(remoteDir){
    try{
        if(remoteDir.match(/^root/)){
            remoteDir = remoteDir.replace(/^root/,'');
        }
        if(!remoteDir.match(/\/$/)){
            remoteDir += '/';
        }
        remoteDir = remoteDir.replace(/\/+/g, '/');
        const dirList = await app.getRemoteDir(remoteDir);
        if(dirList.errno == 0){
            return remoteDir;
        }
        else{
            return config.remote_dir;
        }
    }
    catch(e){
        return config.remote_dir;
    }
}

async function uploadDirContent(){
    const uploadDir = await selectDir(yargs.getArgv('i'));

    if(yargs.getArgv('i') == uploadDir){
        console.log('? Upload Dir:', uploadDir);
    }

    const files = fs.readdirSync(uploadDir, {withFileTypes: true})
        .filter(item => !item.isDirectory() && !item.name.match(/^\..*$/)
            && !item.name.match(/\.tbtemp$/) && !item.name.match(/\.!qB$/))
        .map(item => path.resolve(item.path, item.name));

    let selectedRemoteDir;
    if(yargs.getArgv('r')){
        selectedRemoteDir = await selectRemoteDir(yargs.getArgv('r'));
    }
    else{
        selectedRemoteDir = config.remote_dir;
    }
    
    console.log('Remote Dir:', selectedRemoteDir);
    const remoteDir = selectedRemoteDir;
    
    const remoteDirContent = (await app.getRemoteDir(remoteDir)).list;

    for(const file of files){
        const filename = path.basename(file);
        
        const findFile = remoteDirContent.find(f => {
            return f.isdir == 0 && f.server_filename == filename;
        });
        
        if(findFile){
            console.log(`\n:: File already uploaded: ${filename}, skipping...`);
            continue;
        }
        
        const index = files.indexOf(file) + 1;
        console.log(`\n:: Processing: [${index}/${files.length}] ${filename}`);

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
                console.log('Path:', upload_info.path.split('/').slice(0, -1).join('/') + '/');
                if(upload_info.errno == 0){
                    try{
                        fs.unlinkSync(tbtempfile);
                    }
                    catch(error){
                        console.error('[ERROR] Can\'t remove temp file:', error.message);
                    }
                }
            }
            catch(error){
                console.error('[ERROR] Can\'t save file to remote:', error.message);
            }
        }
    }

    console.log('\n:: Done!\n');
}
