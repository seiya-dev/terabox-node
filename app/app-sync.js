#!/usr/bin/env node

import { runUploader } from './app-uploader.js';

runUploader({ sync: true }).catch(error => {
    console.error('[ERROR]', error);
    process.exitCode = 1;
});
