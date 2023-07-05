import fetch from 'node-fetch';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ENDPOINTS, VARS } from './globals.mjs';

export {
    auth
};

async function auth() {
    const rl = readline.createInterface({ input, output });

    const url = `
    Login to your Epic Account here:
    ${ENDPOINTS.login(VARS.clientId)}

    And please enter your authorization code: `;

    const authCode = await rl.question(url);
    console.log(`Auth Code: ${authCode}`);
    rl.close();
}

