import fetch from 'node-fetch';
import fs from 'node:fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';
import { vaultCache } from './vault.mjs';
import * as utils from './utils.mjs'

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

    async function downloadManifest(vaultData) {

        const manifestList = await downloadManifestList(ENDPOINTS.manifest(vaultData.catalogItemId, vaultData.appName), authData);

        for (const manifests of manifestList.elements) {

            const manifestData = await tryDownloadManifest(manifests.manifests);
            const savePath = `data/manifest/${manifestData.AppNameString}${manifestData.BuildVersionString}.manifest`

            try {

                await fs.writeFile(savePath, JSON.stringify(manifestData));

                console.log(`Downloaded ${savePath}`);

                const simplifiedManifest = {
                    "catalogItemId": vaultData.catalogItemId,
                    "AppNameString": manifestData.AppNameString,
                    "BuildVersionString": manifestData.BuildVersionString
                };

                if (Array.isArray(manifestListCache['catalogItemId'][vaultData.catalogItemId])) {
                    manifestListCache['catalogItemId'][vaultData.catalogItemId].push(simplifiedManifest);
                } else {
                    manifestListCache['catalogItemId'][vaultData.catalogItemId] = [simplifiedManifest];
                }

                manifestListCache['appName'][manifestData.AppNameString] = simplifiedManifest;

            } catch (err) {
                console.error(`Error saving ${savePath}: ${err}`);
            }
        }

    }

    if (authData.access_token && vaultData.length) {

        try {
            await fs.mkdir('data/manifest', { recursive: true });
            await utils.processManager(vaultData, downloadManifest, 10);
            await fs.writeFile('data/manifest.json', JSON.stringify(manifestListCache));
            return manifestListCache;
        } catch (err) {
            console.error(`Error saving manifest.json: ${err}`);
        }

    }

}

async function manifestCache(manifest) {

    let manifestListCache = {};
    let manifestData = [];

    try {
        manifestListCache = JSON.parse(await fs.readFile('data/manifest.json', 'utf8'));
    } catch (err) {
        console.error(`Error reading manifest.json: ${err}`);
    }

    if (manifest) {

        const type = await identifyManifest(manifest, manifestListCache);

        if (type !== '404') {

            let pathList = [];

            if (type === 'catalogItemId') {
                for (const element in manifestListCache['catalogItemId'][manifest]) {
                    pathList.push(`data/manifest/${manifestListCache['catalogItemId'][manifest][element].AppNameString}${manifestListCache['catalogItemId'][manifest][element].BuildVersionString}.manifest`);
                }
            } else if (type === 'appName') {
                pathList.push(`data/manifest/${manifest}${manifestListCache['appName'][manifest].BuildVersionString}.manifest`);
            } else {
                const ext = (type === 'filenoextension') ? '.manifest' : ''
                pathList.push(`data/manifest/${manifest}${ext}`);
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
            await fs.access(`data/manifest/${manifest}`);
            console.log(`${manifest} is file with ext`)
            return "file";
        } catch (err) {

            try {
                await fs.access(`data/manifest/${manifest}.manifest`);
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

        if (response.ok) {

            let manifest = await response.json();

            manifest['CloudDir'] = manifestUri.uri.slice(0, manifestUri.uri.lastIndexOf('/'));

            return manifest;

        }

    }

}
