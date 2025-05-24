#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import Argv from './module-argv.js';
import TeraBoxApp from 'terabox-api';

import {
    loadYaml, saveYaml,
    selectLocalPath, scanLocalPath,
} from './module-helper.js';

import {
    hashFile, getChunkSize,
    unwrapErrorMessage,
} from 'terabox-api/helper.js';

// init app
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (Make TBHash Module)`);

const yargs = new Argv(config, ['l','skip-chunks']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    await selectDirs();
})();

async function selectDirs(){
    const localDir = await selectLocalPath(yargs.getArgv('l'));
    
    await makeHashFs(localDir);
    console.log('\n:: Done!\n');
}

async function makeHashFs(localDir){
    const fsList = scanLocalPath(localDir).filter(item => !item.path.match(/\.tbhash$/));
    
    console.log('\n? Local Path:', localDir);
    const fsListFiles = fsList.filter(item => !item.is_dir);
    
    for(const fi of fsList){
        if(fi.is_dir){
            fi.path = fi.path.replace(/\/$/, '');
            await makeHashFs(fi.path);
            continue;
        }
        
        const filePath = fi.path;
        const fileName = path.basename(filePath);
        
        const tbtempfile = filePath + '.tbhash';
        const data = loadYaml(tbtempfile);
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
        
        saveYaml(tbtempfile, data);
        console.log(':: TBHash File:', path.basename(tbtempfile));
    }
}
