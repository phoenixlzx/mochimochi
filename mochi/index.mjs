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
            // args[1] may be catalogItemId or appName
            manifest(args[1]);
            break;
        case 'download':
            // args[1] maybe manifest file name (without .manifest)
            download(args[1]);
            break;
        default:
            help();
    };
}

function help() {
    let name = 'Kawakyosaki';
    const message = `
    Hello there,
    My name is ${name}.
    Nice to meet you.
    `;
    console.log(message);
}

mochi(args);
