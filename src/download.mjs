import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path from 'path';
import zlib from 'zlib';

import { VARS } from './globals.mjs';
import { manifestCache } from './manifest.mjs';
import * as utils from './utils.mjs'

export {
    download
};

// TODO optimize download & concat process to minimize disk writes

async function download(args) {

    if (args === 'all') {
        const manifestList = await manifestCache();
        await downloadAll(manifestList);
    } else {
        const manifestList = await manifestCache(args);
        await downloadList(manifestList);
    }

}

async function downloadList(list) {

    for (const manifest of list) {
        const chunkList = await getChunkList(manifest);
        await utils.processManager(chunkList, handleChunkDownload, 10);
        const fileList = await getFileList(manifest);
        utils.processManager(fileList, concatChunkToFile, 1);
    }

}

async function downloadAll(list) {

    console.log('Downloading all assets, this will take a long time and a lot of disk space...');
    utils.processManager(list, download, 1);

}

async function getChunkList(manifest) {

    let list = [];

    for (const guid in manifest.ChunkHashList) {
        list.push(`${manifest.CloudDir}/ChunksV3/${manifest.DataGroupList[guid].slice(-2)}/${utils.blob2hex(manifest.ChunkHashList[guid])}_${guid}.chunk`);
    }

    return list;

}

async function handleChunkDownload(url) {

    console.log(`Downloading ${url}`);

    const file = url.slice(url.lastIndexOf('_') + 1);
    await writeBufferToFile(`data/chunk/${file}`, await downloadUrl(url));

}

async function getFileList(manifest) {

    let fileList = [];

    for (const file of manifest.FileManifestList) {

        let chunks = [];
        let fileSize = 0;

        for (const [index, chunk] of file.FileChunkParts.entries()) {

            const offset = parseInt(utils.blob2hex(chunk.Offset, true, true));
            const size = parseInt(utils.blob2hex(chunk.Size, true, true));

            let start = 0;

            if (index !== 0) {
                var prevChunk = chunks[index - 1];
                start = prevChunk.start + prevChunk.size;
            }

            chunks.push({
                path: `data/chunk/${chunk.Guid}.chunk`,
                start: start,
                offset: offset,
                size: size
            });

            fileSize += size;
        }

        fileList.push({
            fileName: `data/asset/${manifest.AppNameString}/${file.Filename}`,
            fileSize: fileSize,
            chunks: chunks
        });
    }

    return fileList;
}

async function concatChunkToFile(fileParams) {

    const chunkBuf = Buffer.alloc(fileParams.fileSize);

    for (const chunk of fileParams.chunks) {

        const compressed = await fs.readFile(chunk.path);

        try {
            const uncompressed = await decompress(compressed, chunk.path);
            uncompressed.copy(chunkBuf, chunk.start, chunk.offset, chunk.offset + chunk.size);
        } catch (err) {
            console.error(err);
        }
    }

    try {
        await writeBufferToFile(fileParams.fileName, chunkBuf);
    } catch (err) {
        console.error(err);
    }

}

async function decompress(data, file) {

    const offset = data[8];
    const slicedData = data.slice(offset === 120 ? 8 : offset);

    return new Promise((resolve, reject) => {
        zlib.inflate(slicedData, (err, uncompressed) => {
            if (err) {
                console.error(`Error decompressing ${file}: ${err}`);
                reject(err);
            } else {
                resolve(uncompressed);
            }
        });
    });
}

async function downloadUrl(url) {

    const response = await fetch(url, {
        headers: {
            "User-Agent": VARS.client_ua
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());

}

async function writeBufferToFile(file, buffer) {

    const dir = path.dirname(file);

    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, buffer);
        console.log(`Write to ${file}`)
    } catch (err) {
        console.error(`Error writing file: ${file}: ${err}`);
    }

}
