import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';

import { VARS } from './globals.mjs';
import { manifestCache } from './manifest.mjs';
import * as utils from './utils.mjs'

export {
    download
};

// TODO optimize download & concat process to minimize disk writes

/*
 * Chunk data format
 * Header magic: 0xB1FE3AA2
 * magic = data.slice(0, 4).reverse().toString('hex');
 * header_version = data.readUInt32LE(4);
 * header_size = data.readUInt32LE(8);
 * compressed_size = data.readUInt32LE(12);
 * guid = '';
 * for (let i = 16; i < 32; i += 4) {
 *     guid += data.readUInt32LE(i).toString('hex');
 * }
 * hash = data.slice(32, 40).reverse().toString('hex');
 * stored_as = data[40] ? 1 : 0; // stored_as 1 = zlib compressed,0 = uncompressed
 * let sha_hash, hash_type, uncompressed_size;
 * if (header_version >= 2) {
 *     sha_hash = data.slice(41, 61).toString('hex');
 *     hash_type = data.slice(61, 62).toString('hex');
 * }
 *
 * if (header_version >= 3) {
 *     uncompressed_size = data.readUInt32LE(62);
 * }
 *
 */

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

        const rawData = await fs.readFile(chunk.path);
        let finalData;
        const headerSize = rawData[8];

        if (rawData[40] ? 1 : 0) {
            finalData = await decompress(rawData.subarray(headerSize), chunk.path);
        } else {
            finalData = rawData.subarray(rawData[8]);
        }

        finalData.copy(chunkBuf, chunk.start, chunk.offset, chunk.offset + chunk.size);

    }

    try {
        await writeBufferToFile(fileParams.fileName, chunkBuf);
    } catch (err) {
        console.error(err);
    }

}

async function decompress(data, file) {

    return new Promise((resolve, reject) => {
        zlib.inflate(data, (err, uncompressed) => {
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
