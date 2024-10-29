#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Argv from '../modules/app-argv.js';
import { Cookie, CookieJar } from 'tough-cookie';
import TeraBoxApp from '../modules/api.js';
import qr from 'qrcode-terminal';

import {
    delay, loadYaml,
} from '../modules/app-helper.js';

// init app
let app = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const meta = loadYaml(path.resolve(__dirname, '../package.json'));

console.log(`[INFO] ${meta.name_ext} v${meta.version} (QR Login)`);

const yargs = new Argv({}, []);
if(yargs.getArgv('help')){
    yargs.showHelp();
    process.exit();
}

(async () => {
    app = new TeraBoxApp();
    await app.updateAppData('login');
    
    const qsBase = new URLSearchParams(app.params.app).toString();
    const bodyData = qrReqBody();
    
    console.log(':: Requesting QR Code...');
    const reqQr = await app.doReq(`/passport/qrcode/get?${qsBase}&jsToken=${app.data.jsToken}`, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': app.params.whost,
        },
        method: 'POST',
        body: bodyData.str(),
    });
    
    qr.generate(app.params.whost + '/?action=login&uuid=' + reqQr.data.uuid, {small: true});
    console.log('[INFO] Scan this QR code with mobile app.');
    
    let doLoginReq = { code: 39 };
    console.log(':: Trying Login...');
    do {
        delay(1000);
        doLoginReq = await qrLogin(reqQr.data.uuid, reqQr.data.seq, 0);
        reqQr.data.seq++;
        // {"code":39,"logid":1739039730,"msg":"login timeout"} -> retry w seq+1;
        // {"code":37,"logid":3933965318,"msg":"uuid expire"} -> force exit
    } while (doLoginReq.code == 39);
    
    if(doLoginReq.code != 0){
        console.log('[ERROR] Failed to Login:', doLoginReq);
        return;
    }
    
    const userData = doLoginReq.data;
    doLoginReq = await qrLogin(reqQr.data.uuid, reqQr.data.seq, 1);
    
    if(doLoginReq.code == 0){
        const cJar = new CookieJar();
        app.params.auth.split(';').map(cookie => cJar.setCookieSync(cookie, app.params.whost));
        const authToken = cJar.toJSON().cookies.find(c => c.key == 'ndus');
        console.log(`[AUTH] ${userData.uname}: ${authToken.value}`);
    }
    else{
        console.log('[AUTH] Failed:', doLoginReq);
    }
    
})();

function qrReqBody(){
    const bodyData = new app.FormUrlEncoded();
    bodyData.append('client', 'web');
    bodyData.append('pass_version', '2.8');
    bodyData.append('lang', 'en');
    bodyData.append('clientfrom', 'h5');
    bodyData.append('pcftoken', app.data.pcftoken);
    return bodyData;
}

async function qrLogin(uuid, seq, step){
    const qsBase = new URLSearchParams(app.params.app).toString();
    const bodyData = qrReqBody();
    bodyData.append('uuid', uuid);
    bodyData.append('seq', seq);
    bodyData.append('step', step);
    
    const reqQrLogin = await app.doReq(`/passport/qrcode/login?${qsBase}&jsToken=${app.data.jsToken}`, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': app.params.whost,
        },
        method: 'POST',
        body: bodyData.str(),
        save_cookies: step > 0 ? true : false,
        timeout: 60000,
    });
    
    return reqQrLogin;
}