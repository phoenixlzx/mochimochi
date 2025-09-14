import fetch from 'node-fetch';
import fs from 'fs/promises';

import {
    ENDPOINTS,
    VARS
} from './globals.mjs';
import {
    auth,
    getCookieHeader,
    handleResponseCookies
} from './auth.mjs';
import {
    vaultCache
} from './vault.mjs';
import {
    manifestBinaryHandler
} from './manifestbin.mjs';
import * as utils from './utils.mjs';

import config from '../config.mjs';

export {
    manifest,
    manifestCache,
    tryDownloadManifest
};

async function manifest() {
    const vaultData = await vaultCache();
    const authData = await auth();

    const manifestListCache = {
        "catalogItemId": {},
        "appName": {}
    };

    try {
        await fs.access(`${config.DATA_DIR}/manifest`);
    } catch (err) {
        await fs.mkdir(`${config.DATA_DIR}/manifest`, {
            recursive: true
        });
    }

    async function downloadManifest(vaultData) {
        console.log(`Processing manifest for ${vaultData.catalogItemId} (${vaultData.artifactId})`);

        if (!vaultData.artifactId || !vaultData.namespace || !vaultData.assetId) {
            console.log(`Missing required data for ${vaultData.catalogItemId}`);
            return;
        }

        const manifestList = await downloadFabManifest(vaultData.artifactId, {
            namespace: vaultData.namespace,
            item_id: vaultData.assetId,
            platform: "Windows"
        }, authData);

        if (manifestList && manifestList.downloadInfo) {
            // console.log(`Found downloadInfo for ${vaultData.catalogItemId}`);

            for (const downloadInfo of manifestList.downloadInfo) {
                if (downloadInfo.distributionPoints) {
                    const manifestData = await tryDownloadManifest(downloadInfo.distributionPoints);

                    if (manifestData.ManifestFileVersion) {
                        const savePath = `${config.DATA_DIR}/manifest/${manifestData.AppNameString}${manifestData.BuildVersionString}.manifest`
                        await fs.writeFile(savePath, JSON.stringify(manifestData));
                        console.log(`Downloaded ${savePath}`);

                        const simplifiedManifest = {
                            "catalogItemId": vaultData.catalogItemId,
                            "listingIdentifier": vaultData.listingIdentifier,
                            "AppNameString": manifestData.AppNameString,
                            "BuildVersionString": manifestData.BuildVersionString
                        };

                        if (Array.isArray(manifestListCache['catalogItemId'][vaultData.catalogItemId])) {
                            manifestListCache['catalogItemId'][vaultData.catalogItemId].push(simplifiedManifest);
                        } else {
                            manifestListCache['catalogItemId'][vaultData.catalogItemId] = [simplifiedManifest];
                        }

                        if (manifestListCache['appName'].hasOwnProperty(manifestData.AppNameString)) {
                            if (manifestListCache['appName'][manifestData.AppNameString]['BuildVersionString'] < simplifiedManifest['BuildVersionString']) {
                                manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;
                            }
                        } else {
                            manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;
                        }
                    }
                }
            }
        } else {
            console.log(`No manifestList found for ${vaultData.catalogItemId}`);
        }
    }

    if (authData.access_token && vaultData.length) {
        try {
            const manifestDownloader = new utils.ProcessManager(vaultData, null, downloadManifest, 5, 500);
            manifestDownloader.on('progress', progress => console.log(`Manifest Download Progress: ${Math.ceil(progress * 100)}%`));
            manifestDownloader.on('complete', () => console.log('Manifest download complete.'));
            await manifestDownloader.process();
        } catch (err) {
            console.error(`Error saving manifest: ${err}`);
        }

        try {
            await fs.writeFile(`${config.DATA_DIR}/public/manifest.json`, JSON.stringify(manifestListCache));
            return manifestListCache;
        } catch (err) {
            console.error(`Error saving manifest.json ${err}`);
        }
    } else {
        console.log(`Skipping manifest download - missing auth token or vault data`);
        try {
            await fs.writeFile(`${config.DATA_DIR}/public/manifest.json`, JSON.stringify(manifestListCache));
            console.log(`Created empty manifest.json`);
        } catch (err) {
            console.error(`Error creating empty manifest.json: ${err}`);
        }
    }
}

async function manifestCache(manifest) {

    let manifestListCache = {};
    let manifestData = [];

    try {

        console.log(`Reading manifest.json`);
        manifestListCache = JSON.parse(await fs.readFile(`${config.DATA_DIR}/public/manifest.json`, 'utf8'));

    } catch (err) {

        console.error(`Error reading manifest.json: ${err}`);
        return manifestListCache;

    }

    if (manifest) {

        const type = await identifyManifest(manifest, manifestListCache);

        if (type !== '404') {

            let pathList = [];

            if (type === 'catalogItemId') {
                for (const element in manifestListCache['catalogItemId'][manifest]) {
                    pathList.push(`${config.DATA_DIR}/manifest/${manifestListCache['catalogItemId'][manifest][element].AppNameString}${manifestListCache['catalogItemId'][manifest][element].BuildVersionString}.manifest`);
                }
            } else if (type === 'appName') {
                pathList.push(`${config.DATA_DIR}/manifest/${manifest}${manifestListCache['appName'][manifest].BuildVersionString}.manifest`);
            } else {
                const ext = (type === 'filenoextension') ? '.manifest' : ''
                pathList.push(`${config.DATA_DIR}/manifest/${manifest}${ext}`);
            }

            for (const path in pathList) {

                try {

                    const data = await JSON.parse(await fs.readFile(pathList[path], 'utf-8'));
                    manifestData.push(data);

                } catch (err) {

                    console.error(`Error reading ${path}: ${err}`);

                }

            }
        }

    } else {

        for (const app in manifestListCache['appName']) {
            manifestData.push(app);
        }

    }

    return manifestData;

}

async function identifyManifest(manifest, manifestListCache) {

    if (manifestListCache.hasOwnProperty('catalogItemId') && manifestListCache.hasOwnProperty('appName')) {

        if (manifestListCache['catalogItemId'][manifest]) {
            // is catalogItemId, return a list of apps
            console.log(`${manifest} is catalogItemId`)
            return "catalogItemId";
        }

        if (manifestListCache['appName'][manifest]) {
            // is specific app, return object
            console.log(`${manifest} is appName`)
            return "appName";
        }

        try {

            await fs.access(`${config.DATA_DIR}/manifest/${manifest}`);
            console.log(`${manifest} is file with ext`)
            return "file";

        } catch (err) {

            try {

                await fs.access(`${config.DATA_DIR}/manifest/${manifest}.manifest`);
                console.log(`${manifest} is file without ext`)
                return "filenoextension";

            } catch (err) {

                console.error(`${manifest} not found.`)
                return "404";

            }

        }

    }

}



async function downloadFabManifest(artifactId, requestBody, authData) {
    const url = ENDPOINTS.fab_manifest(artifactId);
    
    const maxRetries = 3;
    const baseDelay = 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `bearer ${authData.access_token}`,
            "User-Agent": VARS.client_ua,
            "Accept": "*/*",
            "Accept-Encoding": "deflate, gzip",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
        };

        const cookieHeader = getCookieHeader();
        if (cookieHeader) {
            headers.Cookie = cookieHeader;
        }

        try {
            if (attempt > 1) {
                const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                console.log(`Retrying FAB manifest download (attempt ${attempt}/${maxRetries}) after ${Math.round(delay)}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            handleResponseCookies(response);

            if (!response.ok) {
                if (response.status === 403) {
                    if (attempt === maxRetries) {
                        console.error(`403 FORBIDDEN ERROR - FAB Manifest Download Debug Info:`);
                        console.error(`URL: ${url}`);
                        console.error(`Artifact ID: ${artifactId}`);
                        console.error(`Request Body:`, JSON.stringify(requestBody, null, 2));
                        console.error(`Request Headers:`, JSON.stringify(headers, null, 2));
                        console.error(`Response Status: ${response.status} ${response.statusText}`);
                        console.error(`Response Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
                        console.error(`Auth Token Present: ${!!authData.access_token}`);
                        console.error(`Auth Token Length: ${authData.access_token?.length || 0}`);
                        console.error(`Auth Token Prefix: ${authData.access_token?.substring(0, 20)}...`);
                        console.error(`Cookie Header Present: ${!!cookieHeader}`);
                        console.error(`Cookie Header Length: ${cookieHeader?.length || 0}`);
                        
                        try {
                            const errorBody = await response.text();
                            console.error(`Response Body:`, errorBody);
                        } catch (bodyError) {
                            console.error(`Could not read response body:`, bodyError.message);
                        }
                    } else {
                        console.log(`Got 403 for ${artifactId}, will retry (attempt ${attempt}/${maxRetries})`);
                    }
                    continue;
                } else {
                    console.log(`FAB API error for ${url}: ${response.status} ${response.statusText}`);
                    return null;
                }
            }

            const result = await response.json();
            if (attempt > 1) {
                console.log(`Successfully downloaded manifest for ${artifactId} on attempt ${attempt}`);
            }
            return result;
        } catch (error) {
            if (attempt === maxRetries) {
                console.error(`Error calling FAB API ${url}:`, error);
                return null;
            } else {
                console.log(`Network error for ${artifactId}, will retry (attempt ${attempt}/${maxRetries}): ${error.message}`);
            }
        }
    }
    
    return null;
}

async function tryDownloadManifest(distributionPoints) {
    let errorMessages = [];

    for (const distributionPoint of distributionPoints) {
        const url = distributionPoint.manifestUrl;
        if (!url) {
            errorMessages.push(`No manifestUrl in distribution point: ${JSON.stringify(distributionPoint)}`);
            continue;
        }

        let cdnTokens = {};
        const urlObj = new URL(url);
        for (const [key, value] of urlObj.searchParams) {
            if (['f_token', 'cfl_token', 'ak_token', 'cf_token'].includes(key)) {
                cdnTokens[key] = value;
            }
        }

        const maxRetries = 3;
        const baseDelay = 1500;
        let success = false;

        for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
            const headers = {
                "Content-Type": "application/json",
                "User-Agent": VARS.client_ua,
                "Accept": "*/*",
                "Accept-Encoding": "deflate, gzip",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            };

            const cookieHeader = getCookieHeader();
            if (cookieHeader) {
                headers.Cookie = cookieHeader;
            }

            try {
                if (attempt > 1) {
                    const delay = baseDelay * attempt + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const response = await fetch(url, { headers });

                if (response.ok) {
                    let manifest;
                    const resp = new Buffer.from(await response.arrayBuffer());
                    const clouddir = url.slice(0, url.lastIndexOf('/'));

                    try {
                        manifest = JSON.parse(resp.toString());
                        manifest['CloudDir'] = clouddir;
                        manifest['CDNTokens'] = cdnTokens;
                        return manifest;
                    } catch (err) {
                        errorMessages.push(`Error parsing JSON manifest from ${url}: ${err}`);
                    }

                    try {
                        if (resp.readUInt32LE(0) === 0x44BEC00C) {
                            manifest = await manifestBinaryHandler(resp);
                            manifest['CloudDir'] = clouddir;
                            manifest['CDNTokens'] = cdnTokens;
                            return manifest;
                        } else {
                            throw new Error('Invalid manifest: Header Magic not match.');
                        }
                    } catch (err) {
                        errorMessages.push(`Error parsing BIN manifest from ${url}: ${err}`);
                    }
                } else {
                    if (response.status === 403 && attempt < maxRetries) {
                        console.log(`Got 403 for manifest ${url}, retrying (attempt ${attempt}/${maxRetries})`);
                        continue;
                    } else if (response.status === 403) {
                        const errorMsg = `403 FORBIDDEN ERROR - Manifest Download Debug Info:
URL: ${url}
Status: ${response.status} ${response.statusText}
Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}
CDN Tokens: ${JSON.stringify(cdnTokens, null, 2)}
Cookie Header Present: ${!!cookieHeader}
Cookie Header: ${cookieHeader || 'None'}`;
                        
                        try {
                            const errorBody = await response.text();
                            errorMessages.push(`${errorMsg}
Response Body: ${errorBody}`);
                        } catch (bodyError) {
                            errorMessages.push(`${errorMsg}
Could not read response body: ${bodyError.message}`);
                        }
                    } else {
                        errorMessages.push(`Request to ${url} returned error: ${response.status} ${response.statusText}`);
                    }
                }
            } catch (error) {
                if (attempt === maxRetries) {
                    errorMessages.push(`Network error for ${url}: ${error.message}`);
                }
            }
        }
    }

    console.error(`All requests failed. Errors:\n${errorMessages.join('\n')}`);
    return {};
}
