import fs from 'fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { vaultCache } from './vault.mjs';
import * as utils from './utils.mjs'

import config from '../config.mjs';

export {
    detail
};

async function detail() {

    const vaultData = await vaultCache();

    const uniqueAssets = Array.from(new Set(vaultData.map(a => a.catalogItemId)))
        .map(catalogItemId => {
            let asset = vaultData.find(a => a.catalogItemId === catalogItemId);
            return asset;
        });

    try {
        await fs.access(`${config.DATA_DIR}/detail`);
    } catch (err) {
        await fs.mkdir(`${config.DATA_DIR}/detail`, { recursive: true });
    }

    for (const asset of uniqueAssets) {
        const assetDetails = await getAssetDetails(ENDPOINTS.detail(asset.catalogItemId));
        try {
            await fs.writeFile(`${config.DATA_DIR}/detail/${asset.catalogItemId}.json`, JSON.stringify(assetDetails));
        } catch (err) {
            console.error(`Failed to save asset detail: ${err}`);
        }

    }

}

async function getAssetDetails(url) {

    console.log(`Reading ${url}`);

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": VARS.client_ua
    }

    return await utils.fetchJson(url, headers)

}
