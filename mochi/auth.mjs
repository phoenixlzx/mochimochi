import fetch from 'node-fetch';
import * as readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ENDPOINTS, VARS } from './globals.mjs';

export {
    auth
};

async function auth(args) {
    let authData = await readAuth('data/auth.json');
    switch (args) {
        case 'refresh':
            refreshAuth(authData);
            break;
        case 'info':
            return authData;
        default:
            if (authData) {
                const currentDate = new Date();
                const tokenExpires = new Date(authData.expires_at);
                const refreshExpires = new Date(authData.refresh_expires_at);

                if (currentDate >= refreshExpires) {
                    console.log(`
    Auth expired at ${refreshExpires.toLocaleDateString('en-US', VARS.date_options)}.
    `)
                    return login();
                } else {
                    console.log(`
    Auth valid till ${tokenExpires.toLocaleDateString('en-US', VARS.date_options)}
    Current user: ${authData.displayName}
    `)
                    return authData;
                }
            } else {
                login();
            }
    }
}

async function login() {
    const authCode = await readAuthCode();
    const authData = await loginAuth(authCode);
    if (authData && authData.access_token) {
        writeAuth(authData, 'data/auth.json');
        console.log('Auth saved.')
        return authData;
    }
    return;
}

async function readAuth(file) {
    try {
        const authData = JSON.parse(await fs.readFile(file, 'utf8'));
        return authData;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error("No local auth data found.");
        }
    }
    return;
}

async function writeAuth(data, file) {
    try {
        const authData = JSON.stringify(data, null, 2);
        await fs.writeFile(file, authData, 'utf8');
    } catch (err) {
        console.error('Error writing file:', err);
        return err;
    }
    return;
}

async function readAuthCode() {
    const rl = readline.createInterface({ input, output });
    const url = `
    Login to your Epic Account here:
    ${ENDPOINTS.login(VARS.client_id)}
    And please enter your authorization code: `;
    const authCode = await rl.question(url);
    rl.close();
    return authCode;
}

async function loginAuth(authCode) {
    const response = await fetch(ENDPOINTS.auth_code, {
        method: 'post',
        //body: new URLSearchParams(`grant_type=authorization_code&code=${authCode}&token_type=eg1`),
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            token_type: 'eg1'
        }),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${VARS.client_cred_base64}`,
            "User-Agent": VARS.client_ua
        }
    });
    return await response.json();
}
/*
async function refreshAuth(authData) {
    const resp = await fetch(ENDPOINTS.refresh_token(authData.access_token), {
        method: 'delete',
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${VARS.client_cred_base64}`,
            "User-Agent": VARS.client_ua
        }
    });
}
*/
