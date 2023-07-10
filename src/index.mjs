#!/usr/bin/env node

const args = process.argv.slice(2);

import { auth } from './auth.mjs';
import { vault, vaultCache } from './vault.mjs';
import { detail } from './detail.mjs';
import { manifest, manifestCache } from './manifest.mjs';
import { download } from './download.mjs';
import { archive } from './archive.mjs';
import { server } from './server.mjs';

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

function mochi(args) {
    switch (args[0]) {
        case 'auth':
            auth();
            break;
        case 'vault':
            vault();
            break;
        case 'detail':
            detail();
            break;
        case 'manifest':
            manifest();
            break;
        case 'download':
            download(args[1]);
            break;
        case 'archive':
            archive(args[1]);
            break;
        case 'server':
            server();
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

mochi(args);
