import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import { pipeline } from 'stream';
import { promisify } from 'util';

import { ENDPOINTS, VARS } from './globals.mjs';
import { vaultCache } from './vault.mjs';
import { manifestCache } from './manifest.mjs';
import * as utils from './utils.mjs'

export {
    download
};

async function download(args) {
    if (args === 'all') {
        const manifestList = await manifestCache();
        await downloadAll(manifestList);
    } else {
        const manifestList = await manifestCache(args);
        await downloadList(manifestList);
    }
}

async function downloadList(list) {
    console.log(list);
}

async function downloadAll(list) {
    // TODO download all assets
    console.log(list);
}
