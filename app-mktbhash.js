#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import Argv from './modules/app-argv.js';
import TeraBoxApp from './modules/api.js';

import {
    loadJson, saveJson,
    selectAccount, showAccountInfo,
    selectLocalDir, selectRemoteDir,
    scanLocalDir, uploadChunks, uploadFile,
    hashFile, getChunkSize,
    unwrapErrorMessage,
} from './modules/app-helper.js';

// init app
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadJson(path.resolve(__dirname, './.config.json'));
const meta = loadJson(path.resolve(__dirname, './package.json'));

console.log('[INFO] TeraBox App', 'v' + meta.version, '(Make TBHash Module)');

const yargs = new Argv(config, ['l','skip-chunks']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    await selectDirs();
})();

async function selectDirs(){
    const localDir = await selectLocalDir(yargs.getArgv('l'));
    
    await makeHashFs(localDir);
    console.log('\n:: Done!\n');
}

async function makeHashFs(localDir){
    const fsList = scanLocalDir(localDir);
    
    console.log('\n? Local Dir:', localDir);
    const fsListFiles = fsList.filter(item => !item.is_dir);
    
    for(const fi of fsList){
        if(fi.is_dir){
            fi.path = fi.path.replace(/\/$/, '');
            await makeHashFs(fi.path);
            continue;
        }
        
        const filePath = fi.path;
        const fileName = path.basename(filePath);
        const isTBHash = filePath.match(/\.tbhash$/) ? true : false;
        
        if(isTBHash){
            continue;
        }
        
        const tbtempfile = filePath + '.tbhash';
        const data = loadJson(tbtempfile);
        delete data.error;
        
        if(!data.size || isNaN(data.size)){
            data.size = fs.statSync(filePath).size;
        }
        
        const index = fsListFiles.indexOf(fi) + 1;
        const indexStr = `${index}/${fsListFiles.length}`;
        
        console.log(`\n:: Processing: [${indexStr}] ${fileName}`);
        
        if(data.size <= 256 * 1024){
            console.log(`:: File too small, skipping...`);
            continue;
        }
        
        if(data.size > getChunkSize(data.size, true) * 1024){
            console.log(`:: File too big, skipping...`);
            continue;
        }
        
        if(!data.hash){
            console.log(':: Calculating hashes...');
            data.hash = await hashFile(filePath, yargs.getArgv('skip-chunks'));
        }
        
        saveJson(tbtempfile, data);
        console.log(':: TBHash File:', path.basename(tbtempfile));
    }
}
