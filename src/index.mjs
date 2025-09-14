#!/usr/bin/env node

const args = process.argv.slice(2);

import fs from 'fs/promises';

import { auth } from './auth.mjs';
import { vault, vaultCache } from './vault.mjs';
import { detail } from './detail.mjs';
import { manifest, manifestCache } from './manifest.mjs';
import { download } from './download.mjs';
import { archive } from './archive.mjs';
import { server } from './server.mjs';

import config from '../config.mjs';

export {
    auth,
    vault,
    vaultCache,
    detail,
    manifest,
    manifestCache,
    download,
    archive
};

async function mochi(args) {
    switch (args[0]) {
        case 'auth':
            await auth();
            break;
        case 'vault':
            await vault();
            break;
        case 'detail':
            await detail();
            break;
        case 'manifest':
            await manifest();
            break;
        case 'download':
            await download(args[1]);
            break;
        case 'archive':
            await archive(args[1]);
            break;
        case 'server':
            await server();
            break;
        default:
            help();
    };
}

function help() {
    const message = `
    Usage:

    mochi auth
      Login and authorize your Epic Account.

    mochi vault
      Download current vault data and save to disk.

    mochi manifest
      Download manifest for all assets in vault library.

    mochi download <identifier>
      Download asset according to identifier.
      Identifier can be:
      - catalogItemId
      - AppNameString
      - Manifest file (with or without extension)
      - "all" to download all assets available.

    mochi archive <AppNameString>
      Archive downloaded <AppNameString> asset to a ZIP file.
    `;
    console.log(message);
}

for (const d of [
    'asset',
    'archive',
    'chunk',
    'manifest',
    'public',
    'public/status',
    'public/detail'
]) {
    try {
        await fs.access(`${config.DATA_DIR}/${d}`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`Creating data directory at ${config.DATA_DIR}/${d}`);
            await fs.mkdir(`${config.DATA_DIR}/${d}`, {recursive: true});
        } else {
            console.error(`Error accessing ${config.DATA_DIR}/${d}`);
        }
    }
}

await mochi(args);
