import { DecoratorHandler, Agent, FormData, Client, buildConnector, request } from 'undici';
import { Cookie, CookieJar } from 'tough-cookie';
import { filesize } from 'filesize';

import child_process from 'node:child_process';
import tls from 'node:tls';

const TERABOX_UA = 'terabox;1.32.0.1;PC;PC-Windows;10.0.22631;WindowsTeraBox';
const TERABOX_BASE_URL = 'https://www.terabox.com';
const TERABOX_UI_LANG = 'en';
const TERABOX_TIMEOUT = 10000;
const TERABOX_APP_PARAMS = {
    app_id: 250528,
    web: 1,
    channel: 'dubox',
    clienttype: 0, // 5 is wap?
};

function makeRemoteFPath(sdir, sfile){
    const tdir = sdir.match(/\/$/) ? sdir : sdir + '/';
    return tdir + sfile;
}

class FormUrlEncoded {
    constructor(params) {
        this.data = new URLSearchParams();
        if(typeof params === 'object' && params !== null){
            for (const [key, value] of params.entries()) {
                this.data.append(key, value);
            }
        }
    }
    set(param, value){
        this.data.set(param, value);
    }
    append(param, value){
        this.data.append(param, value);
    }
    delete(param){
        this.data.delete(param);
    }
    str(){
        return this.data.toString().replace(/\+/g, '%20');
    }
}

function sign(s1, s2) {
    const p = new Uint8Array(256);
    const a = new Uint8Array(256);
    const result = [];
    
    Array.from({ length: 256 }, (_, i) => {
        a[i] = s1.charCodeAt(i % s1.length);
        p[i] = i;
    });
    
    let j = 0;
    Array.from({ length: 256 }, (_, i) => {
        j = (j + p[i] + a[i]) % 256;
        [p[i], p[j]] = [p[j], p[i]]; // swap
    });
    
    let i = 0; j = 0;
    Array.from({ length: s2.length }, (_, q) => {
        i = (i + 1) % 256;
        j = (j + p[i]) % 256;
        [p[i], p[j]] = [p[j], p[i]]; // swap
        const k = p[(p[i] + p[j]) % 256];
        result.push(s2.charCodeAt(q) ^ k);
    });
    
    return Buffer.from(result).toString('base64');
}


class TeraBoxApp {
    data = {
        csrf: '',
        lang: TERABOX_UI_LANG,
        logid: '0',
        pcftoken: '',
        bdstoken: '',
        jsToken: '', 
    };
    params = {
        whost: TERABOX_BASE_URL,
        // uhost: TERABOX_BASE_URL.replace('www', 'c-jp'),
        app: TERABOX_APP_PARAMS,
        ua: TERABOX_UA,
        auth: '',
        is_vip: true,
        vip_type: 2,
        cursor: 'null',
        space_available: 2 * Math.pow(1024, 3),
    };
    
    constructor(ndus) {
        this.params.auth = `lang=${TERABOX_UI_LANG}${ndus?'; ndus='+ndus:''}`;
    }
    
    async updateAppData(customPath){
        const url = new URL(TERABOX_BASE_URL + (customPath ? `/${customPath}` : '/main'));
        
        try{
            const req = await request(url, {
                headers:{
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT * 2),
            });
            
            if(req.headers['set-cookie']){
                const cJar = new CookieJar();
                this.params.auth.split(';').map(cookie => cJar.setCookieSync(cookie, TERABOX_BASE_URL));
                for(const cookie of req.headers['set-cookie']){
                    cJar.setCookieSync(cookie.split('; ')[0], TERABOX_BASE_URL);
                }
                this.params.auth = cJar.getCookiesSync(TERABOX_BASE_URL).map(cookie => cookie.cookieString()).join('; ');
            }
            
            const rdata = await req.body.text();
            const tdataRegex = /<script>var templateData = (.*);<\/script>/;
            const jsTokenRegex = /window.jsToken%20%3D%20a%7D%3Bfn%28%22(.*)%22%29/;
            const tdata = rdata.match(tdataRegex) ? JSON.parse(rdata.match(tdataRegex)[1]) : {};
            
            if(tdata.jsToken){
                tdata.jsToken = tdata.jsToken.match(/%28%22(.*)%22%29/)[1];
            }
            else if(rdata.match(jsTokenRegex)){
                tdata.jsToken = rdata.match(jsTokenRegex)[1];
            }
            else{
                const isLoginReq = req.headers.location == '/login' ? true : false;
                console.error('[ERROR] Failed to update jsToken', (isLoginReq ? '[Login Required]' : ''));
            }
            
            if(req.headers.logid){
                this.data.logid = req.headers.logid;
            }
            
            this.data.csrf = tdata.csrf || '';
            this.data.pcftoken = tdata.pcftoken || '';
            this.data.bdstoken = tdata.bdstoken || '';
            this.data.jsToken = tdata.jsToken || '';
            
            return tdata;
        }
        catch(error){
            const errorPrefix = '[ERROR] Failed to update jsToken:';
            if(error.name == 'TimeoutError'){
                console.error(errorPrefix, error.message);
                return;
            }
            error = new Error('updateAppData', { cause: error });
            console.error(errorPrefix, error);
        }
    }
    
    async checkLogin(){
        const url = new URL(TERABOX_BASE_URL + '/api/check/login');
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch(error){
            throw new Error('checkLogin', { cause: error });
        }
    }
    
    async getAccountData(){
        const url = new URL(TERABOX_BASE_URL + '/rest/2.0/membership/proxy/user');
        url.search = new URLSearchParams({
            method: 'query',
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            if(rdata.error_code == 0){
                this.params.vip_type = rdata.data.member_info.is_vip;
                this.params.is_vip = this.params.vip_type > 0 ? true : false;
            }
            return rdata;
        }
        catch(error){
            throw new Error('getAccountData', { cause: error });
        }
    }
    
    async getPassport(){
        const url = new URL(TERABOX_BASE_URL + '/passport/get_info');
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getPassport', { cause: error });
        }
    }
    
    async getQuota(){
        const url = new URL(TERABOX_BASE_URL + '/api/quota');
        url.search = new URLSearchParams({
            checkfree: 1,
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            if(rdata.errno == 0){
                rdata.available = rdata.total - rdata.used;
                this.params.space_available = rdata.available;
            }
            return rdata;
        }
        catch (error) {
            throw new Error('getQuota', { cause: error });
        }
    }
    
    async getCoinsCount(){
        const url = new URL(TERABOX_BASE_URL + '/rest/1.0/inte/system/getrecord');
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getCoinsCount', { cause: error });
        }
    }
    
    async getRemoteDir(remoteDir, page = 1){
        const url = new URL(TERABOX_BASE_URL + '/api/list');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        const formData = new FormUrlEncoded();
        formData.append('order', 'name');
        formData.append('desc', 0);
        formData.append('dir', remoteDir);
        formData.append('num', 20000);
        formData.append('page', page);
        formData.append('showempty', 0);
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getRemoteDir', { cause: error });
        }
    }
    
    async getRecycleBin(){
        const url = new URL(TERABOX_BASE_URL + '/api/recycle/list');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            order: 'name',
            desc: 0,
            num: 20000,
            page: 1,
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getRecycleBin', { cause: error });
        }
    }
    
    async clearRecycleBin(){
        const url = new URL(TERABOX_BASE_URL + '/api/recycle/clear');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            // 'async': 1,
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('clearRecycleBin', { cause: error });
        }
    }
    
    async getUserInfo(user_id){
        user_id = parseInt(user_id);
        const url = new URL(TERABOX_BASE_URL + '/api/user/getinfo');
        url.search = new URLSearchParams({
            user_list: JSON.stringify([user_id]),
            need_relation: 0,
            need_secret_info: 1,
        });
        
        try{
            if(isNaN(user_id) || user_id < 1){
                throw new Error(`${user_id} is not user id`);
            }
            
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getUserInfo', { cause: error });
        }
    }
    
    async precreateFile(data){
        const formData = new FormUrlEncoded();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
        // formData.append('target_path', data.remote_dir);
        formData.append('autoinit', 1);
        formData.append('size', data.size);
        formData.append('block_list', JSON.stringify(data.hash.chunks));
        formData.append('rtype', 2);
        if(data.upload_id && typeof data.upload_id == 'string' && data.upload_id != ''){
            formData.append('uploadid', data.upload_id);
        }
        formData.append('content-md5', data.hash.file);
        formData.append('slice-md5', data.hash.slice);
        formData.append('content-crc32', data.hash.crc32);
        // formData.append('local_ctime', '');
        // formData.append('local_mtime', '');
        
        const api_prefix = data.is_teratransfer ? 'a' : '';
        const url = new URL(TERABOX_BASE_URL + `/api/${api_prefixurl}precreate`);
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('precreateFile', { cause: error });
        }
    }
    
    async rapidUpload(data){
        const formData = new FormUrlEncoded();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
        // formData.append('target_path', data.remote_dir);
        formData.append('content-length', data.size);
        formData.append('content-md5', data.hash.file);
        formData.append('slice-md5', data.hash.slice);
        formData.append('content-crc32', data.hash.crc32);
        // formData.append('local_ctime', '');
        // formData.append('local_mtime', '');
        formData.append('block_list', JSON.stringify(data.hash.chunks || []));
        formData.append('rtype', 2);
        formData.append('mode', 1);
        
        if(!Array.isArray(data.hash.chunks)){
            // use unsafe rapid upload if we don't have chunks hash
            formData.delete('block_list');
            formData.set('rtype', 3);
        }
        
        const url = new URL(TERABOX_BASE_URL + '/api/rapidupload');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            if(data.size < 256 * 1024){
                throw new Error(`File size too small!`);
            }
            
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('rapidUpload', { cause: error });
        }
    }
    
    async getUploadHost(){
        const url = new URL(TERABOX_BASE_URL + '/rest/2.0/pcs/file?method=locateupload');
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            this.params.uhost = rdata.host;
            return rdata;
        }
        catch (error) {
            throw new Error('getUploadHost', { cause: error });
        }
    }
    
    async uploadChunk(data, partseq, chunk, onBodySentHandler, externalAbort) {
        // preconfig request
        externalAbort = externalAbort ? externalAbort : new AbortController().signal;
        const timeoutAborter = new AbortController;
        const timeoutId = setTimeout(() => {
            timeoutAborter.abort();
        }, TERABOX_TIMEOUT);
        const undiciInterceptor = (dispatch) => {
            class undiciInterceptorBody extends DecoratorHandler {
                onBodySent(chunk) {
                    let chunkSize = chunk.length;
                    const chunckTxt = (new TextDecoder()).decode(chunk);
                    if(chunckTxt.match(/^------formdata-undici-/)){
                        chunkSize = -1;
                    }
                    timeoutId.refresh();
                    if (onBodySentHandler){
                        onBodySentHandler(chunkSize);
                    }
                }
            }
            return function InterceptedDispatch(opts, handler) {
                return dispatch(opts, new undiciInterceptorBody(handler));
            };
        };
        const dispatcher = new Agent().compose(undiciInterceptor);
        // --
        
        let upload_host;
        try{
            if(typeof this.params.uhost != 'string' || this.params.uhost == ''){
                throw new Error();
            }
            upload_host = new URL(`https://${this.params.uhost}/rest/2.0/pcs/superfile2`);
        }
        catch(e){
            upload_host = new URL(`${TERABOX_BASE_URL.replace('www', 'c-jp')}/rest/2.0/pcs/superfile2`);
        }
        
        const url = upload_host;
        url.search = new URLSearchParams({
            method: 'upload',
            ...TERABOX_APP_PARAMS,
            // type: 'tmpfile',
            path: makeRemoteFPath(data.remote_dir, data.file),
            uploadid: data.upload_id,
            partseq: partseq,
        });
        
        if(data.is_teratransfer){
            url.searchParams.append('useteratransfer', '1')
        }
        
        const formData = new FormData();
        formData.append('file', chunk);

        const req = await dispatcher.request({
            origin: url.origin,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': TERABOX_UA,
                'Cookie': this.params.auth,
            },
            signal: AbortSignal.any([
                externalAbort,
                timeoutAborter.signal,
            ]),
        });
        
        clearTimeout(timeoutId);
        
        if (req.statusCode !== 200) {
            throw new Error(`HTTP error! Status: ${req.statusCode}`);
        }
        
        const res = await req.body.json();
        
        if (!res.error_code) {
            if (res.md5 !== data.hash.chunks[partseq]) {
                throw new Error(`MD5 hash mismatch for file (part: ${res.partseq+1})`)
            }
        }
        else {
            let err = new Error(`upload ${res.error_code}`)
            err.data = res;
            throw err
        }
        
        return res;
    }
    
    async createDir(remoteDir){
        const formData = new FormUrlEncoded();
        formData.append('path', remoteDir);
        formData.append('isdir', 1);
        formData.append('block_list', '[]');
        
        const url = new URL(TERABOX_BASE_URL + '/api/create');
        url.search = new URLSearchParams({
            a: 'commit',
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('createFolder', { cause: error });
        }
    }
    
    async createFile(data) {
        const formData = new FormUrlEncoded();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
        // formData.append('isdir', 0);
        formData.append('size', data.size);
        formData.append('isdir', 0);
        formData.append('block_list', JSON.stringify(data.hash.chunks));;
        formData.append('uploadid', data.upload_id);
        formData.append('rtype', 2);
        // formData.append('local_ctime', '');
        // formData.append('local_mtime', '');
        // formData.append('zip_quality', '');
        // formData.append('zip_sign', '');
        // formData.append('is_revision', 0);
        // formData.append('mode', 2); // 2 is Batch Upload
        // formData.append('exif_info', exifJsonStr);
        
        const api_prefix = data.is_teratransfer ? 'anno' : '';
        const url = new URL(TERABOX_BASE_URL + `/api/${api_prefix}create`);
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            console.log(error);
            throw new Error('createFile', { cause: error });
        }
    }
    
    async filemanager(operation, fmparams){
        const url = new URL(TERABOX_BASE_URL + '/api/filemanager');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            // 'async': 2,
            onnest: 'fail',
            opera: operation, // delete, copy, move, rename
        });
        
        if(!Array.isArray(fmparams)){
            throw new Error('filemanager', { cause: new Error('FS paths should be in array!') });
        }
        
        // For Delete: ["/path1","path2.rar"]
        // For Move: [{"path":"/myfolder/source.bin","dest":"/target/","newname":"newfilename.bin"}]
        // For Copy same as move
        // + "ondup": newcopy, overwrite (optional, skip by default)
        // For rename [{"id":1111,"path":"/dir1/src.bin","newname":"myfile2.bin"}]
        
        const formData = new FormUrlEncoded();
        formData.append('filelist', JSON.stringify(fmparams));
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('filemanager', { cause: error });
        }
    }
    
    async shortUrlInfo(shareId){
        const url = new URL(TERABOX_BASE_URL + '/api/shorturlinfo');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            shorturl: 1 + shareId,
            root: 1,
        });
        
        try{
            const connector = buildConnector({ ciphers: tls.DEFAULT_CIPHERS + ':!ECDHE-RSA-AES128-SHA' });
            const client = new Client(TERABOX_BASE_URL, { connect: connector });
            const req = await request(url, {
                method: 'GET',
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                dispatcher: client,
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('shortUrlInfo', { cause: error });
        }
    }
    
    async shortUrlList(shareId, remoteDir, page = 1){
        remoteDir = remoteDir || ''
        const url = new URL(TERABOX_BASE_URL + '/share/list');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            shorturl: shareId,
            by: 'name',
            order: 'asc',
            num: 20000,
            dir: remoteDir,
            page: page,
        });
        
        if(remoteDir == ''){
            url.searchParams.append('root', '1');
        }
        
        try{
            const connector = buildConnector({ ciphers: tls.DEFAULT_CIPHERS + ':!ECDHE-RSA-AES128-SHA' });
            const client = new Client(TERABOX_BASE_URL, { connect: connector });
            const req = await request(url, {
                method: 'GET',
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                dispatcher: client,
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('shortUrlList', { cause: error });
        }
    }
    
    async fileDiff(){
        const formData = new FormUrlEncoded();
        formData.append('cursor', this.params.cursor);
        if(this.params.cursor == 'null'){
            formData.append('c', 'full');
        }
        formData.append('action', 'manual');
        
        const url = new URL(TERABOX_BASE_URL + '/api/filediff');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            block_list: 1,
            // rand: '',
            // time: '',
            // vip: this.params.vip_type,
            // wp_retry_num: 2,
            // lang: lang: this.data.lang,
            // logid: '',
        });
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            if(rdata.errno == 0){
                this.params.cursor = rdata.cursor;
                if(!Array.isArray(rdata.request_id)){
                    rdata.request_id = [ rdata.request_id ];
                }
                if(rdata.has_more){
                    // Extra FileDiff request...
                    const rFileDiff = await this.fileDiff();
                    if(rFileDiff.errno == 0){
                        rdata.reset = rFileDiff.reset;
                        rdata.request_id = rdata.request_id.concat(rFileDiff.request_id);
                        rdata.entries = Object.assign({}, rdata.entries, rFileDiff.entries);
                        rdata.has_more = rFileDiff.has_more;
                    }
                }
            }
            return rdata;
        }
        catch (error) {
            this.params.cursor = 'null';
            throw new Error('fileDiff', { cause: error });
        }
    }
    
    async genPanToken(){
        const url = new URL(TERABOX_BASE_URL + '/api/pantoken');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            lang: this.data.lang,
            u: 'https://www.terabox.com',
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            return rdata;
        }
        catch (error) {
            throw new Error('genPanToken', { cause: error });
        }
    }
    
    async getHomeInfo(){
        const url = new URL(TERABOX_BASE_URL + '/api/home/info');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await request(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            
            if(rdata.errno == 0){
                rdata.data.signb = sign(rdata.data.sign1, rdata.data.sign3);
            }
            
            return rdata;
        }
        catch (error) {
            throw new Error('getHomeInfo', { cause: error });
        }
    }
    
    async download(fs_ids, signb){
        const url = new URL(TERABOX_BASE_URL + '/api/download');
        
        const formData = new FormUrlEncoded();
        for(const [k, v] of TERABOX_APP_PARAMS.entries()){
             formData.append(k, v);
        }
        formData.append('jsToken', this.data.jsToken);
        formData.append('fidlist', JSON.stringify(fs_ids));
        formData.append('type', 'dlink');
        formData.append('vip', 2); // this.params.vip_type
        formData.append('sign', signb); // base64 sign from getHomeInfo
        formData.append('timestamp', Math.round(Date.now()/1000));
        formData.append('bdstoken', this.data.bdstoken);
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            
            return rdata;
        }
        catch (error) {
            throw new Error('download', { cause: error });
        }
    }
    
    async getFileMeta(remote_file_list){
        const url = new URL(TERABOX_BASE_URL + '/api/filemetas');
        
        const formData = new FormUrlEncoded();
        formData.append('dlink', 1);
        formData.append('origin', 'dlna');
        formData.append('target', JSON.stringify(remote_file_list));
        
        try{
            const req = await request(url, {
                method: 'POST',
                body: formData.str(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (req.statusCode !== 200) {
                throw new Error(`HTTP error! Status: ${req.statusCode}`);
            }
            
            const rdata = await req.body.json();
            
            return rdata;
        }
        catch (error) {
            throw new Error('getFileMeta', { cause: error });
        }
    }
}

export default TeraBoxApp;
