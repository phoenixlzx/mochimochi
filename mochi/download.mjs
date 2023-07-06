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

}
