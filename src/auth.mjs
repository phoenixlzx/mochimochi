import fetch from 'node-fetch';
import * as readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ENDPOINTS, VARS } from './globals.mjs';
import config from '../config.mjs';

export {
    auth
};

async function auth() {

    const authFile = `${config.DATA_DIR}/auth.json`;
    let authData = {};

    try {

        await fs.access(authFile);
        authData = await readAuth(`${config.DATA_DIR}/auth.json`);

    } catch (err) {

        console.error(`Error accessing ${config.DATA_DIR}/auth.json`);

    }

    if (authData.access_token && new Date() < new Date(authData.expires_at)) {
        return authData;
    } else if (authData.access_token && new Date() < new Date(authData.refresh_expires_at)) {
        console.log('Auth expired.');
        //return await refreshAuth(authData);
    } else {
        console.log('Auth invalid.');
        return await login();
    }

}

async function login() {

    const authCode = await readAuthCode();
    const authData = await loginAuth(authCode);

    if (authData && authData.access_token) {
        writeAuth(authData, `${config.DATA_DIR}/auth.json`);
        console.log('Authorized.')
        return authData;
    } else {
        console.error('Authorize failed.');
        process.exit(1);
    }

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

    return {};

}

async function writeAuth(data, file) {

    try {
        const authData = JSON.stringify(data, null, 2);
        await fs.writeFile(file, authData, 'utf8');
    } catch (err) {
        console.error(`Error saving auth.json: ${err}`);
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

async function refreshAuth(authData) {
    const response = await fetch(ENDPOINTS.refresh_token, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${authData.token_type} ${authData.access_token}`,
            "User-Agent": VARS.client_ua
        }
    });
    const newAuth = await response.json();

    return newAuth;
}
