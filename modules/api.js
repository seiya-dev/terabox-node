import * as undici from 'undici';

const TERABOX_UA = 'terabox;1.31.0.1;PC;PC-Windows;10.0.22631;WindowsTeraBox';
const TERABOX_BASE_URL = 'https://www.terabox.com';
const TERABOX_UI_LANG = 'en';
const TERABOX_TIMEOUT = 10000;
const TERABOX_APP_PARAMS = {
    app_id: 250528,
    web: 1,
    channel: 'dubox',
    clienttype: 0,
};

function makeRemoteFPath(sdir, sfile){
    const tdir = sdir.match(/\/$/) ? sdir : sdir + '/';
    return tdir + sfile;
}

/*
some web ui for phone:
https://www.terabox.com/wap/coins
https://www.terabox.com/wap/commercial/taskcenter
https://www.terabox.com/wap/glodminer
https://www.terabox.com/wap/webmaster
https://www.terabox.com/wap/outlogin
https://www.terabox.com/wap/outlogin/emailRegister

https://pan.baidu.com/union/doc/pksg0s9ns
https://www.terabox.com/login?from=pc&lang=en&show_third_login=1
https://www.staticcc.com/fe-opera-static/node-static-v4/fe-webv4-main/js/login.71e8269f.js
https://www.terabox.com/rest/2.0/pcs/file?method=locateupload
https://www.terabox.com/share/teratransfer/sharelist?app_id=250528&web=1&channel=dubox&clienttype=0&page=1&page_size=10
https://www.terabox.com/api/filemetas?dlink=1&origin=dlna&target=["/Videos/Anime/Dragon Ball/[SoM] Dragon Ball DBOX CC (DVD 480p)/Dragon.Ball.001.DBOX.CC.480p.x264-SoM.mkv"]

not tested api:
POST https://www.terabox.com/api/recycle/delete TERABOX_APP_PARAMS jsToken=
fidlist=[12345]

GET https://www.terabox.com/share/teratransfer/sharelist TERABOX_APP_PARAMS jsToken= page=1 page_size=10

POST https://www.terabox.com/share/pset TERABOX_APP_PARAMS jsToken=
schannel=4 channel_list=[0] period=0 path_list=["/sharefolder"] from=teraTransfer pwd=XXXXXX fid_list=[12345]

https://www.terabox.com/api/filemanager?async=2&onnest=fail&opera=delete TERABOX_APP_PARAMS &jsToken=
filelist=[12345]

https://www.terabox.com/s/SHORTURL
https://www.terabox.com/sharing/link?surl=SHORTURL
https://www.terabox.com/share/list?TERABOX_APP_PARAMS&jsToken=&page=1&num=20&by=name&order=asc&site_referer=&shorturl=SHORTURL&root=1
*/

class TeraBoxApp {
    constructor(ndus) {
        this.data = {
            csrf: '',
            lang: TERABOX_UI_LANG,
            pcftoken: '',
            bdstoken: '',
            jsToken: '', 
        };
        this.params = {
            auth: `lang=${TERABOX_UI_LANG};${ndus?' ndus='+ndus:''}`,
            is_vip: true,
            vip_type: 2,
            cursor: 'null',
            space_available: 2 * Math.pow(1024, 3),
        };
    }
    
    async updateAppData(noJsToken){
        const url = new URL(TERABOX_BASE_URL + '/main');
        
        try{
            const req = await fetch(url, {
                headers:{
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            const rdata = await req.text();
            const tdata = JSON.parse(rdata.match(/<script>var templateData = (.*);<\/script>/)[1]);
            
            if(!noJsToken){
                if(tdata.jsToken){
                    tdata.jsToken = tdata.jsToken.match(/%28%22(.*)%22%29/)[1];
                }
                else{
                    console.error('[ERROR] Failed to update jsToken');
                }
            }
            
            this.data.csrf = tdata.csrf || '';
            this.data.pcftoken = tdata.pcftoken || '';
            this.data.bdstoken = tdata.bdstoken || '';
            this.data.jsToken = tdata.jsToken || '';
            
            return tdata;
        }
        catch(error){
            error = new Error('updateAppData', { cause: error });
            console.error('[ERROR] Failed to update jsToken:', error);
        }
    }
    
    async checkLogin(){
        const url = new URL(TERABOX_BASE_URL + '/api/check/login');
        
        try{
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
    
    async getRemoteDir(remoteDir){
        // alternative api:
        // URL: `${TERABOX_BASE_URL}/rest/2.0/xpan/file`
        // QS: `method=list&dir=${remoteDir}`
        const url = new URL(TERABOX_BASE_URL + '/api/list');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            order: 'name',
            desc: 0,
            dir: remoteDir,
            num: 20000,
            page: 1,
            showempty: 0,
        });
        
        try{
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getRemoteDir', { cause: error });
        }
    }
    
    async getRecycleDir(){
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
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getRecycleDir', { cause: error });
        }
    }
    
    async clearRecycleDir(){
        const url = new URL(TERABOX_BASE_URL + '/api/recycle/clear');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
            'async': 1,
        });
        
        try{
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('clearRecycleDir', { cause: error });
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
            
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getUserInfo', { cause: error });
        }
    }
    
    async precreateFile(data){
        const formData = new URLSearchParams();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
        formData.append('size', data.size);
        formData.append('isdir', 0);
        formData.append('block_list', JSON.stringify(data.hash.chunks));
        formData.append('autoinit', 1);
        formData.append('rtype', 2);
        if(data.upload_id && typeof data.upload_id == 'string' && data.upload_id != ''){
            formData.append('uploadid', data.upload_id);
        }
        formData.append('content-md5', data.hash.file);
        formData.append('slice-md5', data.hash.slice);
        formData.append('content-crc32', data.hash.crc32);
        // formData.append('local_ctime', '');
        // formData.append('local_mtime', '');
        
        const url = new URL(TERABOX_BASE_URL + '/api/precreate');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('precreateFile', { cause: error });
        }
    }
    
    async rapidUpload(data){
        const formData = new URLSearchParams();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
        formData.append('target_path', data.remote_dir);
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
            
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                duplex: 'half',
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('rapidUpload', { cause: error });
        }
    }
    
    async uploadChunk(data, partseq, chunk, onBodySent, externalAbort) {
        externalAbort = externalAbort ? externalAbort : new AbortController().signal;
        
        const formData = new FormData();
        formData.append('file', chunk);
        
        const timeoutAborter = new AbortController;
        let timeoutId = setTimeout(() => {
            timeoutAborter.abort();
        }, TERABOX_TIMEOUT);
        
        const undiciInterceptor = (dispatch) => {
            class undiciInterceptorBody extends undici.DecoratorHandler {
                onBodySent(chunk) {
                    timeoutId.refresh();
                    
                    if (onBodySent){
                        onBodySent(chunk);
                    }
                }
            }
            
            return function InterceptedDispatch(opts, handler) {
                return dispatch(opts, new undiciInterceptorBody(handler));
            };
        };
        
        let dispatcher = new undici.Agent().compose(undiciInterceptor);
        
        const url = new URL(TERABOX_BASE_URL.replace('www', 'c-jp') + '/rest/2.0/pcs/superfile2');
        url.search = new URLSearchParams({
            method: 'upload',
            ...TERABOX_APP_PARAMS,
            // type: 'tmpfile',
            path: makeRemoteFPath(data.remote_dir, data.file),
            uploadid: data.upload_id,
            partseq: partseq,
        });
        
        const req = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': TERABOX_UA,
                'Cookie': this.params.auth,
            },
            duplex: 'half',
            signal: AbortSignal.any([
                externalAbort,
                timeoutAborter.signal,
            ]),
            dispatcher,
        });
        
        clearTimeout(timeoutId);
        
        if (!req.ok) {
            throw new Error(`HTTP error! Status: ${req.status}`);
        }
        
        const res = await req.json();
        
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
    
    async createFolder(remoteDir){
        const formData = new URLSearchParams();
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
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('createFolder', { cause: error });
        }
    }
    
    async createFile(data) {
        const formData = new URLSearchParams();
        formData.append('path', makeRemoteFPath(data.remote_dir, data.file));
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
        
        const url = new URL(TERABOX_BASE_URL + '/api/create');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.data.jsToken,
        });
        
        try{
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                duplex: 'half',
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('createFile', { cause: error });
        }
    }
    
    async shortUrlInfo(shareId){ // Untested API
        const url = new URL(TERABOX_BASE_URL + '/api/shorturlinfo');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            root: 1,
            shorturl: shareId,
        });
        
        try{
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('shortUrlInfo', { cause: error });
        }
    }
    
    async fileDiff(){ // Untested API
        const formData = new URLSearchParams();
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
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
    
    async genPanToken(){ // Untested API
        const url = new URL(TERABOX_BASE_URL + '/api/pantoken');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            lang: this.data.lang,
            u: 'https://www.terabox.com',
        });
        
        try{
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
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
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.params.auth,
                },
                signal: AbortSignal.timeout(TERABOX_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! Status: ${req.status}`);
            }
            
            const rdata = await req.json();
            return rdata;
        }
        catch (error) {
            throw new Error('getHomeInfo', { cause: error });
        }
    }
}

export default TeraBoxApp;
