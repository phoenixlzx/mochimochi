import fetch from 'node-fetch';
import fs from 'node:fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';

export {
    vault
};

async function vault(args) {
    const authData = await auth('info');
    if (authData.access_token) {
        const vaultData = await readVaultItems(ENDPOINTS.vault, authData);
        try {
            await fs.writeFile('data/vault.json', JSON.stringify(vaultData, null, 2), 'utf8');
            return vaultData;
        } catch (err) {
            console.error('Error writing file:', err);
            return err;
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
        vaultItems = [...vaultItems, ...data.records];
        if (data.responseMetadata && data.responseMetadata.nextCursor) {
            cursor = data.responseMetadata.nextCursor
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

