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
                    const listingIdentifier = item.customAttributes?.find(attr => attr.ListingIdentifier)?.ListingIdentifier;
                    
                    item.projectVersions.forEach(version => {
                        if (version.artifactId) {
                            const assetData = {
                                catalogItemId: item.legacyItemId,
                                listingIdentifier: listingIdentifier,
                                legacyItemId: item.legacyItemId,
                                artifactId: version.artifactId,
                                appName: version.artifactId,
                                namespace: item.assetNamespace,
                                assetId: item.assetId,
                                title: item.title,
                                images: item.images || [],
                                engineVersions: version.engineVersions || []
                            };
                            
                            mappedItems.push(assetData);
                            
                            // Generate detail file immediately for assets without legacyItemId
                            if (!item.legacyItemId && listingIdentifier) {
                                generateDetailForAssetWithoutLegacyId(assetData, item);
                            }
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


async function generateDetailForAssetWithoutLegacyId(assetData, vaultItem) {
    try {
        const thumbnail = vaultItem.images?.find(img => img.type === 'Featured')?.url || '';
        
        const detailData = {
            data: {
                data: {
                    catalogItemId: assetData.catalogItemId,
                    listingIdentifier: assetData.listingIdentifier,
                    title: assetData.title,
                    description: vaultItem.description || assetData.title,
                    longDescription: vaultItem.description || assetData.title,
                    technicalDetails: '',
                    thumbnail: thumbnail,
                    seller: {
                        name: vaultItem.seller || 'Unknown'
                    },
                    categories: vaultItem.categories?.map(cat => ({ name: cat.name })) || [],
                    platforms: vaultItem.projectVersions?.[0]?.targetPlatforms?.map(p => ({ key: p.toLowerCase(), value: p })) || [{ key: 'windows', value: 'Windows' }],
                    compatibleApps: vaultItem.projectVersions?.[0]?.engineVersions?.map(v => v.replace('UE_', '')) || ['5.0'],
                    keyImages: vaultItem.images?.map(img => ({
                        type: img.type === 'Featured' ? 'Thumbnail' : img.type,
                        url: img.url,
                        width: img.width || 640,
                        height: img.height || 349
                    })) || [],
                    releaseInfo: [{
                        appId: assetData.artifactId,
                        platform: vaultItem.projectVersions?.[0]?.targetPlatforms?.join(', ') || 'Windows',
                        dateAdded: new Date().toISOString()
                    }],
                    licenses: [],
                    listingType: vaultItem.listingType || '3D',
                    assetFormats: []
                }
            }
        };
        
        const filename = assetData.listingIdentifier.replace(/-/g, '');
        await fs.writeFile(`${config.DATA_DIR}/public/detail/${filename}.json`, JSON.stringify(detailData));
        
        console.log(`Generated detail file for ${assetData.title} (${filename}.json) - no legacyItemId`);
    } catch (error) {
        console.error(`Failed to generate detail for ${assetData.title}: ${error}`);
    }
}