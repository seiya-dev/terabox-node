#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// req modules
import { filesize            } from 'filesize'
import { checkbox, select    } from '@inquirer/prompts';

// main api/app
import { selectAccount, loadYaml, delay } from './module-helper.js';
import { formatEta                      } from 'terabox-api/helper.js';

// TB App
import cliProgress from 'cli-progress';
import TeraBoxApp from 'terabox-api';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadYaml(path.resolve(__dirname, './.config.yaml'));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

// specific configs
const REFRESH_INTERVAL = 5000;

console.log(`[INFO] ${meta.name_ext} v${meta.version} (CloudDL Module)`);

const yargs = new Argv(config, ['a']);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

// 
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
    
    try{
        await startApiSequence();
    }
    catch(error){
        console.error(error);
    }
})();

async function startApiSequence(){
    await app.updateAppData();
    
    const modeList = [
        { name: 'monitor tasks', value: 'monitor' },
        { name: 'add task', value: 'add' },
        { name: 'remove tasks', value: 'remove' },
    ];
    
    const mode = await select({
        message: 'Select Mode:',
        choices: modeList,
    });
    
    if(mode == 'monitor'){
        const taskIds = await collectTasks();
        console.log();
        if(taskIds.length > 0){
            await monitor(taskIds.join(','));
        }
    }
    
    if(mode == 'add'){
        const remFiles = await app.search('.torrent');
        const torrents = remFiles.list.filter(f => f.isdir === 0 && f.category === 6 && f.path?.toLowerCase().endsWith('.torrent'));
        
        const selTorrent = [{ value: 'exit' }];
        for(const f of torrents){
            selTorrent.push({ name: f.path, value: { p: f.path.split('/').slice(0, -1).join('/'), t: f.server_filename }});
        }
        
        if(selTorrent.length < 2){
            return;
        }
        
        const tfile = await select({
            message: 'Select Torrent File:',
            choices: selTorrent,
        });
        
        if(tfile === 'exit'){
            return;
        }
        
        await createTask(tfile.p + '/', tfile.t);
    }
    
    if(mode == 'remove'){
        const tsklst = await collectTasks(true);
        console.log();
        
        const tselect = await checkbox({
            message: 'Select Tasks to remove:',
            choices: tsklst,
        });
        if(tselect.length > 0){
            await deleteTasks(tselect.join(','));
        }
    }
}

async function collectTasks(is_all = false){
    const tsklst = await app.clouddl_tasklist();
    const taskIds = [];
    
    for (const t of tsklst.task_info){
        const itask_nm = `${t.task_id} : [${statuses[t.status]}] ${t.source_url}`
        const itask_id = !is_all ? t.task_id : { name: itask_nm, value: t.task_id }
        
        if(t.status == '1' || is_all){
            taskIds.push(itask_id);
        }
        
        console.log(itask_nm);
    }
    
    return taskIds;
}

async function createTask(upfld, src){
    const rUpload1 = await app.clouddl_query_sinfo(upfld + src);
    const idxList = [
        { name: 'skip files', value: '-1' },
        { name: 'all files', value: '0' },
    ];
    
    if(rUpload1.torrent_info){
        for (const [index, value] of rUpload1.torrent_info.file_info.entries()) {
            idxList.push({ name: String(index+1).padStart(3) + ': ' + value.file_name + ` (${fb2str(Number(value.size))})`, value: String(index+1) });
        }
        
        const selectedIndex = await checkbox({
            message: 'Select Files',
            choices: idxList,
        });
        
        if(selectedIndex.length > 0 && !selectedIndex.includes('-1')){
            const selFiles = selectedIndex.includes('0') ? Array.from({ length: rUpload1.torrent_info.file_count }, (_, i) => 1 + i).join(',') : selectedIndex.join(',');
            console.log('Selected Index:', selFiles);
            const rUpload2 = await app.clouddl_add_task(upfld + src, rUpload1.torrent_info.sha1, selFiles, upfld);
            console.log(rUpload2);
        }
    }
}

async function deleteTasks(tIds){
    const tskIds = tIds.split(',');
    for (const t of tskIds){
        const c = await app.clouddl_cancel_task(t);
        console.log('cancel task:', t, c);
        const d = await app.clouddl_delete_task(t);
        console.log('delete task:', t, d);
    }
}

const statuses = { 
    '0': 'DONE!   ',
    '1': 'DOWNLOAD',
    '2': 'SYS ERR ',
    '3': 'NO RES  ',
    '4': 'TIMEOUT ',
    '5': 'FAILED  ',
    '6': 'NO SPACE',
    '7': 'EXISTS  ',
    '8': 'CANCELED',
}

const previousStats = new Map();
function calcSpeed(taskId, finished) {
    const now = Date.now();
    const prev = previousStats.get(taskId);
    if (!prev) {
        previousStats.set(taskId, { finished, ts: now, speed: 0 });
        return 0;
    }
    const dt = (now - prev.ts) / 1000;
    const df = finished - prev.finished;
    let instant = 0;
    if (dt > 0 && df >= 0) instant = df / dt;
    const smooth = prev.speed * 0.7 + instant * 0.3;
    previousStats.set(taskId, { finished, ts: now, speed: smooth });
    return smooth;
}

const multibar = new cliProgress.MultiBar(
    {
        clearOnComplete: false,
        hideCursor: true,
        format: '{name}: {status} |{bar}| {percentHR}% | {valueHR}/{remainingHR}/{totalHR} | {speedHR}/s | ETA: {etaHR}',
    },
    cliProgress.Presets.shades_classic
);

const bars = new Map();
function updateBars(data) {
    for (const [taskId, t] of Object.entries(data.task_info)) {
        const total = Number(t.file_size || 0);
        
        if (!bars.has(taskId)) {
            bars.set(taskId, multibar.create(total, 0, {name: taskId}));
        }
        
        const finished = Number(t.finished_size || 0);
        const speedBps = calcSpeed(taskId, finished);
        const remaining = Math.max(0, total - finished);
        const etaSec = speedBps > 0 ? remaining / speedBps : NaN;
        
        const percent = total > 0 ? (finished / total) * 100 : 0;
        const bar = bars.get(taskId);
        
        if (bar.getTotal() !== total) {
            bar.setTotal(total);
        }
        
        bar.update(finished, {
            status: statuses[t.status],
            percentHR:   percent.toFixed(2).padStart(6),
            valueHR:     fb2str(finished).padStart(11),
            remainingHR: fb2str(remaining).padStart(11),
            totalHR:     fb2str(total).padStart(11),
            speedHR:     fb2str(speedBps).padStart(11),
            etaHR:       formatEta(etaSec).padStart(9),
        });
    }
}

function fb2str(bytes) {
    return filesize(bytes, {standard: 'iec', round: 2, pad: true, separator: '.'})
}

async function monitor(taskIds) {
    while (true) {
        try{
            const data = await app.clouddl_query_task(1, taskIds);
            updateBars(data);
        }
        catch(e){}
        await delay(REFRESH_INTERVAL);
    }
}
