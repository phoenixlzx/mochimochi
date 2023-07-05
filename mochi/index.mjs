// get the command-line arguments
const args = process.argv.slice(2);

import { auth } from './auth.mjs';
import { vault } from './vault.mjs';

function mochi(args) {
    switch (args[0]) {
        case 'auth':
            auth(args[1]);
            break;
        case 'vault':
            vault(args);
            break;
        case 'download':
            // TODO
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
