import fetch from 'node-fetch';
import fs from 'fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';
import { vaultCache } from './vault.mjs';
import * as utils from './utils.mjs'

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

                    manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;
                }

            }

        }

    }

    if (authData.access_token && vaultData.length) {

        try {

            const manifestDownloader = new utils.ProcessManager(vaultData, downloadManifest, 10);

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

        console.log(`Writing manifest.json`);
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

        let manifest = {};

        if (response.ok) {

            try {

                manifest = await response.json();
                manifest['CloudDir'] = manifestUri.uri.slice(0, manifestUri.uri.lastIndexOf('/'));
                return manifest;

            } catch (err) {

                console.error(`Error downloading from ${url}: ${err}`);
                return {};

            }

        }

    }

}
