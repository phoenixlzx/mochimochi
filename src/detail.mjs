import fs from 'fs/promises';

import { ENDPOINTS } from './globals.mjs';
import { vaultCache } from './vault.mjs';
import { makeAuthenticatedRequest } from './auth.mjs';

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
        const detailIds = batch.map(asset => asset.listingIdentifier || asset.catalogItemId);
        
        try {
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueAssets.length/batchSize)} (${batch.length} assets)`);
            const bulkDetails = await getBulkAssetDetails(detailIds);
            
            for (const detail of bulkDetails) {
                // Find the corresponding vault asset by matching the detail ID we sent
                const vaultAsset = batch.find(asset => {
                    const sentId = asset.listingIdentifier || asset.catalogItemId;
                    return sentId === detail.catalogItemId;
                });
                
                if (vaultAsset) {
                    const processedDetail = processAssetDetail(detail, vaultAsset);
                    
                    const filename = vaultAsset.listingIdentifier ? 
                        vaultAsset.listingIdentifier.replace(/-/g, '') : 
                        vaultAsset.catalogItemId;
                    
                    await fs.writeFile(`${config.DATA_DIR}/public/detail/${filename}.json`, JSON.stringify(processedDetail));
                    
                    if (vaultAsset.listingIdentifier && vaultAsset.listingIdentifier !== vaultAsset.catalogItemId) {
                        await fs.writeFile(`${config.DATA_DIR}/public/detail/${vaultAsset.catalogItemId}.json`, JSON.stringify(processedDetail));
                    }
                    
                    console.log(`Saved detail for ${vaultAsset.title} (${filename})`);
                } else {
                    console.warn(`Could not find vault asset for detail ID: ${detail.catalogItemId}`);
                }
            }
        } catch (err) {
            console.error(`Bulk detail request failed for batch, falling back to individual requests: ${err}`);
            
            for (const asset of batch) {
                try {
                    const detailId = asset.listingIdentifier || asset.catalogItemId;
                    const assetDetails = await getBulkAssetDetails([detailId]);
                    
                    if (assetDetails.length > 0) {
                        const processedDetail = processAssetDetail(assetDetails[0], asset);
                        const filename = asset.listingIdentifier ? 
                            asset.listingIdentifier.replace(/-/g, '') : 
                            asset.catalogItemId;
                        
                        await fs.writeFile(`${config.DATA_DIR}/public/detail/${filename}.json`, JSON.stringify(processedDetail));
                        
                        if (asset.listingIdentifier && asset.listingIdentifier !== asset.catalogItemId) {
                            await fs.writeFile(`${config.DATA_DIR}/public/detail/${asset.catalogItemId}.json`, JSON.stringify(processedDetail));
                        }
                    }
                } catch (individualErr) {
                    console.error(`Failed to get detail for ${asset.catalogItemId}: ${individualErr}`);
                }
            }
        }
    }

}

async function getBulkAssetDetails(detailIds) {
    console.log(`Fetching bulk details for ${detailIds.length} assets using IDs: ${detailIds.slice(0, 3).join(', ')}${detailIds.length > 3 ? '...' : ''}`);

    const formData = detailIds.map(id => `id=${id}`).join('&');

    const response = await makeAuthenticatedRequest(ENDPOINTS.bulk_catalog, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'Accept-Encoding': 'deflate, gzip',
            'X-Epic-Correlation-ID': `UE4-723ec5a34ca59d352eaf0e971e422b8c-2F78085848B4654E7E9DBE86E10641D2-${Date.now().toString(16).toUpperCase()}`
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bulk catalog request failed: ${response.status} ${response.statusText} - ${errorText}`);
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



function processAssetDetail(detail, vaultAsset) {
    return {
        data: {
            data: mapEpicToLegacyFormat(detail, vaultAsset)
        }
    };
}

function mapEpicToLegacyFormat(detail, vaultAsset) {
    const thumbnail = detail.keyImages && detail.keyImages.length > 0 
        ? detail.keyImages.find(img => img.type === 'DieselGameBoxTall' || img.type === 'DieselGameBox')?.url
        : null;

    const compatibleApps = detail.releaseInfo && detail.releaseInfo.length > 0
        ? detail.releaseInfo.map(release => release.appId.replace('UE_', '').replace('EA', '')).filter(v => v)
        : ["5.0"];

    return {
        catalogItemId: vaultAsset?.catalogItemId || detail.catalogItemId,
        listingIdentifier: vaultAsset?.listingIdentifier || detail.catalogItemId,
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


