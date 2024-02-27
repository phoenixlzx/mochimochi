import fetch from 'node-fetch';
import fs from 'fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';
import { vaultCache } from './vault.mjs';
import { manifestBinaryHandler } from './manifestbin.mjs';
import * as utils from './utils.mjs';

import config from '../config.mjs';

export {
    manifest,
    manifestCache
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
        await fs.mkdir(`${config.DATA_DIR}/manifest`, { recursive: true });
    }

    async function downloadManifest(vaultData) {

        const manifestList = await downloadManifestList(ENDPOINTS.manifest(vaultData.catalogItemId, vaultData.appName), authData);

        if (manifestList && Array.isArray(manifestList.elements) && manifestList.elements.length > 0) {

            for (const manifests of manifestList.elements) {

                const manifestData = await tryDownloadManifest(manifests.manifests);

                if (manifestData.ManifestFileVersion) {
                    const savePath = `${config.DATA_DIR}/manifest/${manifestData.AppNameString}${manifestData.BuildVersionString}.manifest`

                    await fs.writeFile(savePath, JSON.stringify(manifestData));

                    console.log(`Downloaded ${savePath}`);

                    const simplifiedManifest = {
                        "catalogItemId": manifestData.catalogItemId,
                        "AppNameString": manifestData.AppNameString,
                        "BuildVersionString": manifestData.BuildVersionString
                    };

                    if (Array.isArray(manifestListCache['catalogItemId'][vaultData.catalogItemId])) {
                        manifestListCache['catalogItemId'][vaultData.catalogItemId].push(simplifiedManifest);
                    } else {
                        manifestListCache['catalogItemId'][vaultData.catalogItemId] = [simplifiedManifest];
                    }

                    if (manifestListCache['appName'].hasOwnProperty(manifestData.AppNameString)) {
                        // developer uploaded new build for same AppNameString, only store the latest build.
                        if (manifestListCache['appName'][manifestData.AppNameString]['BuildVersionString'] < simplifiedManifest['BuildVersionString']) {
                            manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;
                        }
                    } else {
                        manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;
                    }

                }

            }

        }

    }

    if (authData.access_token && vaultData.length) {

        try {

            const manifestDownloader = new utils.ProcessManager(vaultData, null, downloadManifest, 10);

            manifestDownloader.on('progress', progress => console.log(`Manifest Download Progress: ${Math.ceil(progress * 100)}%`));
            manifestDownloader.on('complete', () => console.log('Manifest download complete.'));

            await manifestDownloader.process();

        } catch (err) {

            console.error(`Error saving manifest: ${err}`);

        }

        try {

            await fs.writeFile(`${config.DATA_DIR}/manifest.json`, JSON.stringify(manifestListCache));

            return manifestListCache;

        } catch (err) {

            console.error(`Error saving manifest.json ${err}`);

        }

    }

}

async function manifestCache(manifest) {

    let manifestListCache = {};
    let manifestData = [];

    try {

        console.log(`Reading manifest.json`);
        manifestListCache = JSON.parse(await fs.readFile(`${config.DATA_DIR}/manifest.json`, 'utf8'));

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

async function downloadManifestList(url, authData) {

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `${authData.token_type} ${authData.access_token}`,
        "User-Agent": VARS.client_ua
    }

    return await utils.fetchJson(url, headers)

}

async function tryDownloadManifest(manifests) {
    let errorMessages = [];

    for (const manifestUri of manifests) {
        const query = new URLSearchParams();

        for (const param of manifestUri.queryParams) {
            query.append(param.name, param.value)
        }

        const url = `${manifestUri.uri}?${query}`
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": VARS.client_ua
            }
        });

        if (response.ok) {
            let manifest;
            try {
                const contentType = response.headers.get("content-type");
                if (contentType === "application/json") {
                    manifest = await response.json();
                } else if (contentType === "text/plain") {
                    manifest = await manifestBinaryHandler(await response.text());
                }

                manifest['CloudDir'] = manifestUri.uri.slice(0, manifestUri.uri.lastIndexOf('/'));
                return manifest;
            } catch (err) {
                errorMessages.push(`Error parsing manifest from ${url}: ${err}`);
            }
        } else {
            errorMessages.push(`Request to ${url} returned error: ${response.status}`);
        }
    }

    console.error(`All requests failed. Errors:\n${errorMessages.join('\n')}`);
    return {};
}
