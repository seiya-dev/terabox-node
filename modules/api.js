import * as undici from 'undici';

// https://www.terabox.com/login?from=pc&lang=en&show_third_login=1
const TERABOX_UA = 'terabox;1.31.0.1;PC;PC-Windows;10.0.22631;WindowsTeraBox';
const TERABOX_BASE_URL = 'https://www.terabox.com';
const TERABOX_API_TIMEOUT = 10000;
const TERABOX_APP_PARAMS = {
    app_id: 250528,
    web: 1,
    channel: 'dubox',
    clienttype: 0,
};

class TeraBoxApp {
    constructor(ndus) {
        this.cookieString = 'lang=en; ndus=' + ndus;
        this.app_data = { jsToken: '', };
    }

    async updateAppData(noJsToken){
        try{
            const url = TERABOX_BASE_URL + '/main';
            const req = await fetch(url, {
                headers:{
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            const data = await req.text();
            this.app_data = JSON.parse(data.match(/<script>var templateData = (.*);<\/script>/)[1]);
            if(!noJsToken){
                if(this.app_data.jsToken){
                    this.app_data.jsToken = this.app_data.jsToken.match(/%28%22(.*)%22%29/)[1];
                }
                else{
                    console.error('[ERROR] Failed to update jsToken');
                    this.app_data.jsToken = '';
                }
            }
        }
        catch(error){
            error = new Error('updateAppData', { cause: error });
            console.error('[ERROR] Failed to update jsToken:', error);
        }
    }

    async checkLogin(){
        try{
            const url = TERABOX_BASE_URL + '/api/check/login';
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const data = await req.json();
            return data;
        }
        catch(error){
            throw new Error('checkLogin', { cause: error });
        }
    }

    async getAccountData(){
        try{
            const url = new URL(TERABOX_BASE_URL + '/rest/2.0/membership/proxy/user');
            url.search = new URLSearchParams({
                method: 'query',
            });
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const data = await req.json();
            return data;
        }
        catch(error){
            throw new Error('getAccountData', { cause: error });
        }
    }

    async getPassport(){
        try{
            const url = TERABOX_BASE_URL + '/passport/get_info';
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const data = await req.json();
            return data;
        }
        catch (error) {
            throw new Error('getPassport', { cause: error });
        }
    }

    async getQuota(){
        try{
            const url = new URL(TERABOX_BASE_URL + '/api/quota');
            url.search = new URLSearchParams({
                checkfree: 1,
            });
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const quota = await req.json();
            quota.available = quota.total - quota.used;

            return quota;
        }
        catch (error) {
            throw new Error('getQuota', { cause: error });
        }
    }

    async getRemoteDir(remoteDir){
        try{
            // alternative api:
            // URL: `${TERABOX_BASE_URL}/rest/2.0/xpan/file`
            // QS: `method=list&dir=${remoteDir}`
            const url = new URL(TERABOX_BASE_URL + '/api/list');
            url.search = new URLSearchParams({
                ...TERABOX_APP_PARAMS,
                jsToken: this.app_data.jsToken,
                order: 'name',
                desc: 0,
                dir: remoteDir,
                num: 20000,
                page: 1,
                showempty: 0,
            });

            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const data = await req.json();

            return data;
        }
        catch (error) {
            throw new Error('getRemoteDir', { cause: error });
        }
    }
    
    async getRecycleDir(){
        try{
            const url = new URL(TERABOX_BASE_URL + '/api/recycle/list');
            url.search = new URLSearchParams({
                ...TERABOX_APP_PARAMS,
                jsToken: this.app_data.jsToken,
                order: 'name',
                desc: 0,
                num: 20000,
                page: 1,
            });
            
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }
            
            const data = await req.json();
            
            return data;
        }
        catch (error) {
            throw new Error('getRecycleDir', { cause: error });
        }
    }
    
    async clearRecycleDir(){
        try{
            const url = new URL(TERABOX_BASE_URL + '/api/recycle/clear');
            url.search = new URLSearchParams({
                ...TERABOX_APP_PARAMS,
                jsToken: this.app_data.jsToken,
                'async': 1,
            });
            
            const req = await fetch(url, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }
            
            const data = await req.json();
            
            return data;
        }
        catch (error) {
            throw new Error('clearRecycleDir', { cause: error });
        }
    }

    async getUserInfo(user_id){
        user_id = parseInt(user_id);
        if(isNaN(user_id)){
            throw new Error(`getUserInfo: ${user_id} is not user id`);
        }
        try{
            const url = TERABOX_BASE_URL + '/api/user/getinfo';
            const qs = new URLSearchParams({
                user_list: JSON.stringify([user_id]),
                need_relation: 0,
                need_secret_info: 1,
            }).toString();
            const req = await fetch(url + qs, {
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });

            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }

            const data = await req.json();
            return data;
        }
        catch (error) {
            throw new Error('getUserInfo', { cause: error });
        }
    }

    async precreateFile(data){
        const formData = new URLSearchParams();
        formData.append('path', `${data.remote_dir}/${data.file}`);
        formData.append('size', data.size);
        formData.append('isdir', 0);
        formData.append('block_list', JSON.stringify(data.hash.chunks));
        formData.append('autoinit', 1);
        formData.append('rtype', 2);
        if(data.upload_id && typeof data.upload_id == 'string' && data.upload_id != ''){
            formData.append('uploadid', data.upload_id);
        }
        formData.append('content-md5', data.hash.file);
        formData.append('slice-md5', data.hash.slice); // first 256kb of file
        formData.append('content-crc', data.hash.crc);
        // formData.append('local_ctime', '');
        // formData.append('local_mtime', '');
        
        const url = new URL(TERABOX_BASE_URL + '/api/precreate');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.app_data.jsToken,
        });
        
        try{
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }
            
            const responseData = await req.json();
            if (responseData.uploadid) {
                return responseData;
            }
            else {
                throw new Error(`${responseData.errno}: ${responseData.errmsg}`);
            }
        }
        catch (error) {
            throw new Error('precreateFile', { cause: error });
        }
    }
    
    async uploadChunk(data, partseq, chunk, onBodySent, externalAbort) {
        externalAbort = externalAbort ? externalAbort : new AbortController().signal;
        
        const formData = new FormData();
        formData.append('file', chunk);

        const timeoutAborter = new AbortController;
        let timeoutId = setTimeout(() => {
            timeoutAborter.abort();
        }, TERABOX_API_TIMEOUT);
        
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
            path: data.remote_dir + '/' + data.file,
            uploadid: data.upload_id,
            partseq: partseq,
        });
        
        const req = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': TERABOX_UA,
                'Cookie': this.cookieString,
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
            throw new Error(`HTTP error! status: ${req.status}`);
        }
        
        const res = await req.json();
        
        if (!res.error_code) {
            if (res.md5 !== data.hash.chunks[partseq]) {
                throw new Error(`MD5 hash mismatch for file (part: ${res.partseq+1})`)
            }
        }
        else {
            let err = new Error(`upload error ${res.error_code}`)
            err.data = res;
            throw err
        }
        
        return res;
    }
    
    async createFolder(remoteDir){
        const formData = new URLSearchParams();
        formData.append('path', remoteDir + '/');
        formData.append('isdir', 1);
        formData.append('block_list', '[]');
        
        const url = new URL(TERABOX_BASE_URL + '/api/create');
        url.search = new URLSearchParams({
            ...TERABOX_APP_PARAMS,
            jsToken: this.app_data.jsToken,
        });
        
        try{
            const req = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
                },
                signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
            });
            
            if (!req.ok) {
                throw new Error(`HTTP error! status: ${req.status}`);
            }
            
            const responseData = await req.json();
            return responseData;
        }
        catch (error) {
            throw new Error('createFolder', { cause: error });
        }
    }

    async createFile(data) {
        const formData = new URLSearchParams();
        formData.append('path', `${data.remote_dir}/${data.file}`);
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
            jsToken: this.app_data.jsToken,
        });

        const req = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': TERABOX_UA,
                    'Cookie': this.cookieString,
            },
            duplex: 'half',
            signal: AbortSignal.timeout(TERABOX_API_TIMEOUT),
        });

        if (!req.ok) {
            throw new Error(`HTTP error! status: ${req.status}`);
        }

        const rdata = await req.json();

        if (rdata.errno != 0) {
            console.log(rdata);
            throw new Error(`create error: ${rdata.errno}`);
        }

        return rdata;
    }
}

export default TeraBoxApp;
