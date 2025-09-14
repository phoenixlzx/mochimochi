import fetch from 'node-fetch';
import * as readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ENDPOINTS, VARS } from './globals.mjs';
import config from '../config.mjs';

export {
    auth,
    clientCredentialsAuth,
    getClientCredentialsToken,
    makeAuthenticatedRequest,
    liveInterceptorAuth,
    getExchangeCode,
    getCookieHeader,
    handleResponseCookies
};

let cookieJar = new Map();

async function auth() {
    let authData = {};

    try {
        authData = await readAuth(`${config.DATA_DIR}/auth.json`);
    } catch (err) {
        console.error(`Error accessing ${config.DATA_DIR}/auth.json`);
    }

    if (authData.access_token && new Date() < new Date(authData.expires_at)) {
        return authData;
    } else if (authData.refresh_token && new Date() < new Date(authData.refresh_expires_at)) {
        console.log('Auth expired, refreshing token.');
        const refreshedAuth = await refreshAuth(authData);
        if (refreshedAuth && refreshedAuth.access_token) {
            writeAuth(refreshedAuth, `${config.DATA_DIR}/auth.json`);
            console.log('Token refreshed.');
            return refreshedAuth;
        } else {
            console.log('Token refresh failed, re-authenticating.');
            return await login();
        }
    } else {
        console.log('Auth invalid.');
        return await login();
    }
}

async function login() {
    console.log('Starting Epic Games authentication process...');
    
    // Step 1: Get initial client credentials token
    console.log('Step 1: Getting client credentials token...');
    const initialAuth = await clientCredentialsAuth();
    if (!initialAuth || !initialAuth.access_token) {
        throw new Error('Failed to get initial client credentials token');
    }
    console.log('✅ Client credentials token obtained');

    // Step 2: Get CDN tokens via Live-Interceptor
    console.log('Step 2: Getting CDN tokens via Live-Interceptor...');
    await liveInterceptorRequest(initialAuth.access_token);
    console.log('✅ CDN tokens obtained');

    // Step 3: Get exchange code through web login
    console.log('Step 3: Getting exchange code through web login...');
    const exchangeCode = await getExchangeCode();
    console.log('✅ Exchange code obtained');

    // Step 4: Exchange code for final access token
    console.log('Step 4: Exchanging code for access token...');
    const authData = await exchangeCodeAuth(exchangeCode);

    if (authData && authData.access_token) {
        writeAuth(authData, `${config.DATA_DIR}/auth.json`);
        console.log('✅ Authentication successful!');
        return authData;
    } else {
        console.error('❌ Authentication failed.');
        console.error('Response:', JSON.stringify(authData, null, 2));
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



async function exchangeCodeAuth(authCode) {
    // First, convert authorization code to access token
    const authHeaders = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `basic ${VARS.client_cred_base64}`,
        "User-Agent": VARS.client_ua,
        "X-Epic-Correlation-ID": `UE4-${generateMachineId()}-${generateCorrelationId()}-${generateCorrelationId()}`
    };

    const cookieHeader = getCookieHeader();
    if (cookieHeader) {
        authHeaders.Cookie = cookieHeader;
    }

    const authResponse = await fetch(ENDPOINTS.auth_token, {
        method: 'post',
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            token_type: 'eg1'
        }),
        headers: authHeaders
    });

    const authResult = await authResponse.json();
    handleResponseCookies(authResponse);

    if (!authResponse.ok) {
        console.error(`Authorization code exchange failed: ${authResponse.status}: ${authResponse.statusText}`);
        console.error('Error response:', JSON.stringify(authResult, null, 2));
        throw new Error('Failed to exchange authorization code');
    }

    // Now get exchange code using the access token
    const exchangeResponse = await fetch(ENDPOINTS.exchange, {
        method: 'GET',
        headers: {
            'Authorization': `${authResult.token_type} ${authResult.access_token}`,
            'User-Agent': VARS.client_ua
        }
    });

    const exchangeResult = await exchangeResponse.json();

    if (!exchangeResponse.ok) {
        console.error(`Exchange code request failed: ${exchangeResponse.status}: ${exchangeResponse.statusText}`);
        console.error('Error response:', JSON.stringify(exchangeResult, null, 2));
        throw new Error('Failed to get exchange code');
    }

    // Finally, use exchange code to get the final token
    const finalHeaders = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `basic ${VARS.client_cred_base64}`,
        "User-Agent": VARS.client_ua,
        "X-Epic-Correlation-ID": `UE4-${generateMachineId()}-${generateCorrelationId()}-${generateCorrelationId()}`
    };

    if (cookieHeader) {
        finalHeaders.Cookie = cookieHeader;
    }

    const finalResponse = await fetch(ENDPOINTS.auth_token, {
        method: 'post',
        body: new URLSearchParams({
            grant_type: 'exchange_code',
            exchange_code: exchangeResult.code,
            token_type: 'eg1'
        }),
        headers: finalHeaders
    });

    const finalResult = await finalResponse.json();
    handleResponseCookies(finalResponse);

    if (!finalResponse.ok) {
        console.error(`Final token exchange failed: ${finalResponse.status}: ${finalResponse.statusText}`);
        console.error('Error response:', JSON.stringify(finalResult, null, 2));
    }
    
    return finalResult;
}

async function clientCredentialsAuth() {
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `basic ${VARS.client_cred_base64}`,
        "User-Agent": VARS.client_ua,
        "X-Epic-Correlation-ID": `UE4-${generateMachineId()}-${generateCorrelationId()}-${generateCorrelationId()}`
    };

    const cookieHeader = getCookieHeader();
    if (cookieHeader) {
        headers.Cookie = cookieHeader;
    }

    const response = await fetch(ENDPOINTS.auth_token, {
        method: 'post',
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            token_type: 'eg1'
        }),
        headers
    });

    const result = await response.json();
    
    handleResponseCookies(response);
    
    return result;
}

function handleResponseCookies(response) {
    const setCookieHeaders = response.headers.raw()['set-cookie'];
    if (setCookieHeaders) {
        setCookieHeaders.forEach(cookie => {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=');
            if (name.startsWith('__cf_') || name.startsWith('cf_')) {
                cookieJar.set(name, value);
            }
        });
    }
}

function getCookieHeader() {
    const cookies = [];
    for (const [name, value] of cookieJar) {
        cookies.push(`${name}=${value}`);
    }
    return cookies.length > 0 ? cookies.join('; ') : null;
}

async function refreshAuth(authData) {

    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `basic ${VARS.client_cred_base64}`,
        "User-Agent": VARS.client_ua
    };

    const cookieHeader = getCookieHeader();
    if (cookieHeader) {
        headers.Cookie = cookieHeader;
    }

    const response = await fetch(ENDPOINTS.refresh_token, {
        method: 'post',
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: authData.refresh_token,
            token_type: 'eg1'
        }),
        headers
    });

    const result = await response.json();

    if (!response.ok) {
        console.error(`Refresh HTTP ${response.status}: ${response.statusText}`);
        console.error('Refresh error response:', JSON.stringify(result, null, 2));
    }
    
    handleResponseCookies(response);
    
    return result;
}
async function getClientCredentialsToken() {
    const authData = await clientCredentialsAuth();
    if (authData && authData.access_token) {
        return authData.access_token;
    }
    throw new Error('Failed to get client credentials token');
}

async function makeAuthenticatedRequest(url, options = {}) {
    const authData = await clientCredentialsAuth();
    
    if (!authData || !authData.access_token) {
        throw new Error('Failed to get authentication token');
    }
    
    const headers = {
        'Authorization': `${authData.token_type} ${authData.access_token}`,
        'User-Agent': VARS.client_ua,
        ...options.headers
    };
    
    const cookieHeader = getCookieHeader();
    if (cookieHeader) {
        headers.Cookie = cookieHeader;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    handleResponseCookies(response);
    
    return response;
}

async function liveInterceptorRequest(accessToken) {
    const machineId = generateMachineId();
    const clientVersion = "18.9.0-45233261%2B%2B%2BPortal%2BRelease-Live-Windows";
    
    const url = `https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/v2/platform/Windows/launcher?label=Live-Interceptor&clientVersion=${clientVersion}&machineId=${machineId}`;
    
    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'deflate, gzip',
        'Content-Type': 'application/json',
        'X-Epic-Correlation-ID': `UE4-${machineId}-${generateCorrelationId()}-${generateCorrelationId()}`,
        'User-Agent': VARS.client_ua,
        'Authorization': `bearer ${accessToken}`,
        'Content-Length': '0'
    };
    
    const cookieHeader = getCookieHeader();
    if (cookieHeader) {
        headers.Cookie = cookieHeader;
    }
    
    const response = await fetch(url, {
        method: 'GET',
        headers
    });
    
    handleResponseCookies(response);
    
    if (!response.ok) {
        throw new Error(`Live-Interceptor request failed: ${response.status}`);
    }
    
    return await response.json();
}

async function getExchangeCode() {
    const rl = readline.createInterface({ input, output });
    
    console.log('\n=== Epic Games Login Required ===');
    console.log('Please follow these steps:');
    console.log('1. Open this URL in your browser:');
    console.log(`   ${ENDPOINTS.login(VARS.client_id)}`);
    console.log('2. Login with your Epic Games account');
    console.log('3. After login, you will be redirected to a page with an authorization code');
    console.log('4. Copy the authorization code from the URL or page and paste it below');
    console.log('');
    
    const authCode = await rl.question('Enter the authorization code: ');
    rl.close();
    
    if (!authCode || authCode.trim().length === 0) {
        throw new Error('No authorization code provided');
    }
    
    return authCode.trim();
}

function generateMachineId() {
    return "723ec5a34ca59d352eaf0e971e422b8c";
}

function generateCorrelationId() {
    return Math.random().toString(16).substring(2, 34).toUpperCase();
}

async function liveInterceptorAuth() {
    const initialAuth = await clientCredentialsAuth();
    if (!initialAuth || !initialAuth.access_token) {
        throw new Error('Failed to get initial auth token');
    }
    
    await liveInterceptorRequest(initialAuth.access_token);
    
    const finalAuth = await clientCredentialsAuth();
    if (!finalAuth || !finalAuth.access_token) {
        throw new Error('Failed to get final auth token');
    }
    
    return finalAuth;
}