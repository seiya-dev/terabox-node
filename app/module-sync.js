import fs from 'node:fs';
import path from 'node:path';

import { loadYaml } from './module-helper.js';

export async function deleteRemoteExtras(app, localDir, remoteDir){
    const entries = fs.readdirSync(localDir, { withFileTypes: true });
    const localNames = new Set(entries.map(entry => entry.name));
    for(const entry of entries){
        if(entry.isDirectory() || !entry.name.endsWith('.tbhash')){
            continue;
        }
        const data = loadYaml(path.join(localDir, entry.name));
        // A hash file represents its upload target as well as the local file.
        localNames.add(entry.name.replace(/\.tbhash$/, ''));
        if(typeof data.file === 'string' && data.file){
            localNames.add(data.file);
        }
    }
    
    const remoteEntries = [];
    for(let page = 1; ; page++){
        const response = await app.getRemoteDir(remoteDir, page);
        if(response.errno != 0 || !Array.isArray(response.list)){
            throw new Error('Failed to list remote directory', { cause: response });
        }
        remoteEntries.push(...response.list);
        if(!response.has_more && response.list.length < 20000){
            break;
        }
    }
    
    for(const entry of remoteEntries){
        const name = entry.server_filename;
        if(typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\]/.test(name)){
            throw new Error('Invalid remote entry name');
        }
    }
    for(const entry of remoteEntries){
        if(localNames.has(entry.server_filename)){
            continue;
        }
        const remotePath = path.posix.join(remoteDir, entry.server_filename);
        const response = await app.filemanager('delete', [remotePath]);
        if(response.errno != 0 || response.info?.some(item => item.errno != null && item.errno != 0)){
            throw new Error(`Failed to delete ${remotePath}`, { cause: response });
        }
        console.log(':: Deleted remote entry:', remotePath);
    }
}
