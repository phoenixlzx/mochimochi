import fetch from 'node-fetch';
import fs from 'node:fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';

export {
    vault,
    vaultCache
};

async function vault() {
    const authData = await auth();
    const vaultData = await readVaultItems(ENDPOINTS.vault, authData);
    try {
        await fs.writeFile('data/vault.json', JSON.stringify(vaultData, null, 2), 'utf8');
        return vaultData;
    } catch (err) {
        console.error('Error writing file:', err);
        return;
    }
}

async function vaultCache() {
    try {
        const cache = await fs.readFile('data/vault.json', 'utf8');
        if (Array.isArray(cache)) {
            return cache;
        }
        return [];
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error('Vault cache not exist.');
            return await vault();
        } else {
            console.error('Error reading cache:', err);
            return;
        }
    }
}

async function readVaultItems(url, authData) {
    let hasNext = 1;
    let cursor;
    let vaultItems = [];

    while (hasNext) {
        let query = 'includeMetadata=true';
        if (cursor) {
            query = `${query}&cursor=${cursor}`
        }
        let data = await readOneVaultPage(`${url}?${query}`, authData);
        if (Array.isArray(data.records)) {
            vaultItems = [...vaultItems, ...data.records];
            if (data.responseMetadata && data.responseMetadata.nextCursor) {
                cursor = data.responseMetadata.nextCursor
            } else {
                hasNext = 0;
            }
        } else {
            hasNext = 0;
        }
    }

    return vaultItems;
}

async function readOneVaultPage(url, authData) {
    console.log(`Reading ${url}`)
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${authData.token_type} ${authData.access_token}`,
            "User-Agent": VARS.client_ua
        }
    });
    return await response.json();
}

