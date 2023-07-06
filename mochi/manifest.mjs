import fetch from 'node-fetch';
import fs from 'node:fs/promises';

import { ENDPOINTS, VARS } from './globals.mjs';
import { auth } from './auth.mjs';
import { vault } from './vault.mjs';
import * as utils from './utils.mjs'

export {
    manifest,
    manifestCache
};

async function manifest(args) {
    const vaultData = await vault();
    const authData = await auth();

    async function getManifestList(vaultData) {
        const manifestList = await downloadManifestList(ENDPOINTS.manifest(vaultData.catalogItemId, vaultData.appName), authData);
        for (const manifests of manifestList.elements) {
            const manifestData = await tryDownloadManifest(manifests.manifests);
            const savePath = `data/manifest/${manifestData.AppNameString}${manifestData.BuildVersionString}.manifest`
            try {
                await fs.writeFile(savePath, JSON.stringify(manifestData));
                console.log(`Downloaded ${savePath}`);
            } catch (err) {
                if (err) {
                    console.error(`Error saving ${savePath}`);
                }
            }
        }
    }

    if (authData.access_token && vaultData.length) {
        await utils.processManager(vaultData, getManifestList, 1);
    }
}

async function manifestCache(manifest) {
    const path = `data/manifest/${manifest}.manifest`
    try {
        const data = await fs.readFile(path, 'utf-8');
        return data;
    } catch (error) {
        console.error(`Error reading file at ${path}:`, error);
        return;
    }
}

async function downloadManifestList(url, authData) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${authData.token_type} ${authData.access_token}`,
            "User-Agent": VARS.client_ua
        }
    });
    return await response.json();
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
            return await response.json();
        }
    }
}
