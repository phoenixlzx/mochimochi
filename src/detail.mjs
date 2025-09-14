import fs from 'fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { vaultCache } from './vault.mjs';
import { makeAuthenticatedRequest } from './auth.mjs';
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

    const batchSize = 50;
    for (let i = 0; i < uniqueAssets.length; i += batchSize) {
        const batch = uniqueAssets.slice(i, i + batchSize);
        const catalogItemIds = batch.map(asset => asset.catalogItemId);
        
        try {
            const bulkDetails = await getBulkAssetDetails(catalogItemIds);
            
            for (const detail of bulkDetails) {
                const processedDetail = processAssetDetail(detail);
                await fs.writeFile(`${config.DATA_DIR}/public/detail/${detail.catalogItemId}.json`, JSON.stringify(processedDetail));
            }
        } catch (err) {
            console.error(`Bulk detail request failed, falling back to individual requests: ${err}`);
            
            for (const asset of batch) {
                try {
                    const assetDetails = await getAssetDetails(ENDPOINTS.detail(asset.catalogItemId));
                    const processedDetail = processAssetDetail(assetDetails);
                    await fs.writeFile(`${config.DATA_DIR}/public/detail/${asset.catalogItemId}.json`, JSON.stringify(processedDetail));
                } catch (individualErr) {
                    console.error(`Failed to get detail for ${asset.catalogItemId}: ${individualErr}`);
                }
            }
        }
    }

}

async function getBulkAssetDetails(catalogItemIds) {
    console.log(`Fetching bulk details for ${catalogItemIds.length} assets`);

    const formData = catalogItemIds.map(id => `nsItemId=ue:${id}`).join('&');

    const response = await makeAuthenticatedRequest(ENDPOINTS.bulk_detail, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '*/*',
            'Accept-Encoding': 'deflate, gzip',
            'X-Epic-Correlation-ID': `UE4-723ec5a34ca59d352eaf0e971e422b8c-2F78085848B4654E7E9DBE86E10641D2-${Date.now().toString(16).toUpperCase()}`
        },
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Bulk detail request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return Object.values(data).map(item => ({
        catalogItemId: item.id,
        title: item.title,
        description: item.description,
        longDescription: item.longDescription,
        technicalDetails: item.technicalDetails,
        keyImages: item.keyImages || [],
        categories: item.categories || [],
        namespace: item.namespace,
        status: item.status,
        creationDate: item.creationDate,
        lastModifiedDate: item.lastModifiedDate,
        customAttributes: item.customAttributes || {},
        entitlementName: item.entitlementName,
        entitlementType: item.entitlementType,
        itemType: item.itemType,
        releaseInfo: item.releaseInfo || [],
        developer: item.developer,
        developerId: item.developerId,
        eulaIds: item.eulaIds || [],
        endOfSupport: item.endOfSupport,
        mainGameItemList: item.mainGameItemList || [],
        ageGatings: item.ageGatings || {},
        applicationId: item.applicationId,
        requiresSecureAccount: item.requiresSecureAccount,
        unsearchable: item.unsearchable
    }));
}

async function getAssetDetails(url) {

    console.log(`Reading ${url}`);

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": VARS.client_ua
    }

    return await utils.fetchJson(url, headers)

}

function processAssetDetail(detail) {
    return {
        data: {
            data: mapEpicToLegacyFormat(detail)
        }
    };
}

function mapEpicToLegacyFormat(detail) {
    const thumbnail = detail.keyImages && detail.keyImages.length > 0 
        ? detail.keyImages.find(img => img.type === 'DieselGameBoxTall' || img.type === 'DieselGameBox')?.url
        : null;

    const compatibleApps = detail.releaseInfo && detail.releaseInfo.length > 0
        ? detail.releaseInfo.map(release => release.appId.replace('UE_', '').replace('EA', '')).filter(v => v)
        : ["5.0"];

    return {
        catalogItemId: detail.catalogItemId,
        title: detail.title,
        description: detail.description,
        longDescription: detail.longDescription || detail.description,
        technicalDetails: detail.technicalDetails || detail.description,
        thumbnail: thumbnail,
        seller: {
            name: detail.developer || "Epic Games"
        },
        categories: detail.categories ? detail.categories.map(cat => ({ 
            name: cat.path ? cat.path.split('/').pop() : 'Unknown' 
        })) : [],
        platforms: detail.releaseInfo && detail.releaseInfo.length > 0 
            ? detail.releaseInfo[0].platform || ["Windows"]
            : ["Windows"],
        compatibleApps: compatibleApps,
        keyImages: detail.keyImages ? detail.keyImages.map(img => ({
            type: img.type === 'DieselGameBoxTall' ? 'Screenshot' : img.type,
            url: img.url,
            width: img.width,
            height: img.height
        })) : [],
        releaseInfo: detail.releaseInfo ? detail.releaseInfo.map(release => ({
            appId: release.appId,
            platform: Array.isArray(release.platform) ? release.platform.join(', ') : release.platform,
            dateAdded: release.dateAdded
        })) : []
    };
}


