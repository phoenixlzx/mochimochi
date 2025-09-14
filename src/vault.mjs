import fs from 'fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';
import * as utils from './utils.mjs'

import config from '../config.mjs';

export {
    vault,
    vaultCache,
    readVaultItems
};

async function vault() {

    const authData = await auth();
    
    if (!authData.account_id) {
        throw new Error('Account ID required for UE library access');
    }
    
    const vaultUrl = ENDPOINTS.ue_library(authData.account_id);
    const vaultData = await readVaultItems(vaultUrl, authData);

    try {

        await fs.writeFile(`${config.DATA_DIR}/public/vault.json`, JSON.stringify(vaultData, null, 2), 'utf8');
        return vaultData;

    } catch (err) {

        console.error(`Error saving vault.json: ${err}`);
        return;

    }

}

async function vaultCache() {

    try {

        const cache = JSON.parse(await fs.readFile(`${config.DATA_DIR}/public/vault.json`, 'utf8'));

        if (Array.isArray(cache)) {
            return cache;
        }

        return [];

    } catch (err) {

        if (err.code === 'ENOENT') {
            console.error('Vault cache not exist.');
            return await vault();
        } else {
            console.error(`Error reading vault cache: ${err}`);
            return;
        }

    }

}

async function readVaultItems(url, authData) {

    let allItems = [];
    let nextCursor = null;
    let currentUrl = url;

    do {
        const response = await readOneVaultPage(currentUrl, authData);
        
        if (response && response.results && Array.isArray(response.results)) {
            const mappedItems = [];
            
            response.results.forEach(item => {
                if (item.projectVersions && Array.isArray(item.projectVersions)) {
                    item.projectVersions.forEach(version => {
                        if (version.artifactId) {
                            mappedItems.push({
                                catalogItemId: item.legacyItemId || item.assetId,
                                artifactId: version.artifactId,
                                appName: version.artifactId,
                                namespace: item.assetNamespace,
                                assetId: item.assetId,
                                title: item.title
                            });
                        }
                    });
                }
            });
            
            allItems = allItems.concat(mappedItems);
            
            nextCursor = response.cursors && response.cursors.next;
            if (nextCursor) {
                currentUrl = `${url}&cursor=${encodeURIComponent(nextCursor)}`;
            }
        } else {
            nextCursor = null;
        }
        
        console.log(`Retrieved ${allItems.length} items so far...`);
        
    } while (nextCursor);

    return allItems;

}



async function readOneVaultPage(url, authData) {

    console.log(`Reading ${url}`);

    const headers = {
            "Content-Type": "application/json",
            "Authorization": `${authData.token_type} ${authData.access_token}`,
            "User-Agent": VARS.client_ua
    }

    return await utils.fetchJson(url, headers)

}

