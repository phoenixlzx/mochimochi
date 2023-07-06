// get the command-line arguments
const args = process.argv.slice(2);

import { auth } from './auth.mjs';
import { vault } from './vault.mjs';
import { manifest } from './manifest.mjs';
import { download } from './download.mjs';

function mochi(args) {
    switch (args[0]) {
        case 'auth':
            auth();
            break;
        case 'vault':
            vault();
            break;
        case 'manifest':
            manifest();
            break;
        case 'download':
            download(args[1]);
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
    `;
    console.log(message);
}

mochi(args);
