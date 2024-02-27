import fs from 'fs/promises';
import zlib from 'zlib';
import {
    promisify
} from 'util';
import crc32 from 'crc-32';
import * as utils from './utils.mjs';

const inflateAsync = promisify(zlib.inflate);

export {
    manifestBinaryHandler
}

async function manifestBinaryHandler(data) {

    let manifestData;
    let manifestObj = {};
    let parsed;

    try {
        parsed = await parseManifest(data);
        if (parsed.storedAs) {
            manifestData = await decompressData(parsed.data);
        } else {
            manifestData = parsed.data;
        }
    } catch (err) {
        console.log(`Error handling binary manifest: ${err}`);
        return {};
    }

    const meta = await parseManifestMeta(manifestData);
    manifestData = manifestData.slice(meta.metaSize);
    const cdl = await parseCDL(manifestData);
    manifestData = manifestData.slice(cdl.size);
    const fml = await parseFML(manifestData);
    manifestData = manifestData.slice(fml.size);

    manifestObj = {
        ManifestFileVersion: utils.num2blob(meta.featureLevel),
        bIsFileData: meta.isFileData,
        AppID: meta.appId,
        AppNameString: meta.appName,
        BuildVersionString: meta.buildVersion,
        LaunchExeString: meta.launchExe,
        LaunchCommand: meta.launchCommand,
        PrereqIds: meta.prereqIds,
        PrereqName: meta.prereqName,
        PrereqPath: meta.prereqPath,
        PrereqArgs: meta.prereqArgs,
        FileManifestList: [],
        ChunkHashList: {},
        ChunkShaList: {},
        DataGroupList: {},
        ChunkFilesizeList: {},
        CustomFields: {}
    };

    for (const cd of cdl.elements) {
        const guid = cd.guid.map(g => g.toString(16).padStart(8, '0')).join("").toUpperCase();
        manifestObj.ChunkHashList[guid] = utils.bigInt2blob(cd.hash);
        manifestObj.ChunkShaList[guid] = cd.sha_hash.toString('hex');
        manifestObj.DataGroupList[guid] = cd.group_num.toString().padStart(3, '0');
    }

    for (const fm of fml.elements) {

        let chunkParts = [];

        for (const cp of fm.chunk_parts) {
            const cpguid = cp.guid.map(g => g.toString(16).padStart(8, '0')).join("").toUpperCase();
            chunkParts.push({
                Guid: cpguid,
                Offset: utils.num2blob(cp.offset, 12),
                Size: utils.num2blob(cp.size, 12)
            });
        }

        manifestObj.FileManifestList.push({
            Filename: fm.filename,
            FileHash: utils.hex2blob(fm.hash.toString('hex')),
            FileChunkParts: chunkParts
        });
    }

    return manifestObj;

}

async function decompressData(data) {
    try {
        const uncompressed = await inflateAsync(data);
        return uncompressed;
    } catch (err) {
        console.error(`Error decompressing binary manifest: ${err}`);
        throw err;
    }
}

async function parseManifest(buffer) {
    let offset = 0;

    // Header Magic
    const headerMagic = buffer.readUInt32LE(offset);
    offset += 4;
    /*
    if (headerMagic !== 0x44BEC00C) {
        throw new Error('Invalid Manifest: No header magic!');
    }
    */

    // Header Size
    const headerSize = buffer.readUInt32LE(offset);
    offset += 4;

    // Size Uncompressed
    const sizeUncompressed = buffer.readUInt32LE(offset);
    offset += 4;

    // Size Compressed
    const sizeCompressed = buffer.readUInt32LE(offset);
    offset += 4;

    // SHA-1 Hash
    const shaHash = buffer.slice(offset, offset + 20);
    offset += 20;

    // Stored As
    const storedAs = buffer.readUInt8(offset);
    offset += 1;

    // Version
    const version = buffer.readUInt32LE(offset);
    offset += 4;

    // Data
    const data = buffer.slice(offset);

    return {
        headerMagic,
        headerSize,
        sizeUncompressed,
        sizeCompressed,
        shaHash,
        storedAs,
        version,
        data,
    };
}

async function parseManifestMeta(buffer) {
    let offset = 0;
    const meta = {
        metaSize: buffer.readUInt32LE(offset),
        dataVersion: buffer.readUInt8(offset + 4),
        featureLevel: buffer.readUInt32LE(offset + 5),
        isFileData: buffer.readUInt8(offset + 9) === 1,
        appId: buffer.readUInt32LE(offset + 10),
        appName: '',
        buildVersion: '',
        launchExe: '',
        launchCommand: '',
        prereqIds: [],
        prereqName: '',
        prereqPath: '',
        prereqArgs: '',
        uninstallActionPath: '',
        uninstallActionArgs: '',
        buildId: '',
    };

    offset += 14;
    let result = readFString(buffer, offset);
    meta.appName = result.str;
    offset = result.newOffset;

    result = readFString(buffer, offset);
    meta.buildVersion = result.str;
    offset = result.newOffset;

    result = readFString(buffer, offset);
    meta.launchExe = result.str;
    offset = result.newOffset;

    result = readFString(buffer, offset);
    meta.launchCommand = result.str;
    offset = result.newOffset;

    const entries = buffer.readUInt32LE(offset);
    offset += 4;

    for (let i = 0; i < entries; i++) {
        result = readFString(buffer, offset);
        meta.prereqIds.push(result.str);
        offset = result.newOffset;
    }

    result = readFString(buffer, offset);
    meta.prereqName = result.str;
    offset = result.newOffset;

    result = readFString(buffer, offset);
    meta.prereqPath = result.str;
    offset = result.newOffset;

    result = readFString(buffer, offset);
    meta.prereqArgs = result.str;
    offset = result.newOffset;

    if (meta.dataVersion >= 1) {
        result = readFString(buffer, offset);
        meta.buildId = result.str;
        offset = result.newOffset;
    }

    if (meta.dataVersion >= 2) {
        result = readFString(buffer, offset);
        meta.uninstallActionPath = result.str;
        offset = result.newOffset;

        result = readFString(buffer, offset);
        meta.uninstallActionArgs = result.str;
        offset = result.newOffset;
    }

    return meta;
}

async function parseCDL(buffer) {

    let offset = 0;
    const cdl = {
        version: 0,
        size: 0,
        count: 0,
        elements: [],
        _manifest_version: 18,
        _guid_map: null,
        _guid_int_map: null,
        _path_map: null
    };

    cdl.size = buffer.readUInt32LE(offset);
    offset += 4;
    cdl.version = buffer.readUInt8(offset);
    offset += 1;
    cdl.count = buffer.readUInt32LE(offset);
    offset += 4;

    for (let i = 0; i < cdl.count; i++) {
        const element = {
            guid: null,
            hash: 0,
            sha_hash: null,
            group_num: 0,
            window_size: 0,
            file_size: 0
        };
        cdl.elements.push(element);
    }

    for (const element of cdl.elements) {
        element.guid = [
            buffer.readUInt32LE(offset),
            buffer.readUInt32LE(offset + 4),
            buffer.readUInt32LE(offset + 8),
            buffer.readUInt32LE(offset + 12)
        ];
        offset += 16;
    }

    for (const element of cdl.elements) {
        element.hash = buffer.readBigUInt64LE(offset);
        offset += 8;
    }

    for (const element of cdl.elements) {
        element.sha_hash = buffer.slice(offset, offset + 20);
        offset += 20;
    }

    for (const element of cdl.elements) {
        element.group_num = buffer.readUInt8(offset);
        offset += 1;
    }

    for (const element of cdl.elements) {
        element.window_size = buffer.readUInt32LE(offset);
        offset += 4;
    }

    for (const element of cdl.elements) {
        element.file_size = buffer.readBigInt64LE(offset);
        offset += 8;
    }

    return cdl;
}

async function parseChunkInfo(buffer, manifestVersion = 18) {
    const guid = [
        buffer.readUInt32LE(0),
        buffer.readUInt32LE(4),
        buffer.readUInt32LE(8),
        buffer.readUInt32LE(12),
    ];
    const hash = buffer.readBigUInt64LE(16).toString(16);
    const shaHash = buffer.slice(24, 44).toString('hex');
    const windowSize = buffer.readUInt32LE(44);
    const fileSize = buffer.readBigInt64LE(48).toString();
    const groupNum = computeGroupNum(guid);

    return {
        guid: guidStr(guid),
        hash,
        shaHash,
        windowSize,
        fileSize,
        groupNum,
        path: computePath(manifestVersion, groupNum, hash, guid)
    };
}

async function parseFML(buffer) {
    let offset = 0;
    const fml = {
        version: 0,
        size: 0,
        count: 0,
        elements: [],
    };

    fml.size = buffer.readUInt32LE(offset);
    offset += 4;

    fml.version = buffer.readUInt8(offset);
    offset += 1;

    fml.count = buffer.readUInt32LE(offset);
    offset += 4;

    for (let i = 0; i < fml.count; i++) {
        fml.elements.push({
            filename: '',
            symlink_target: '',
            hash: null,
            flags: 0,
            install_tags: [],
            chunk_parts: []
        });
    }

    fml.elements.forEach((elem) => {
        const filenameResult = readFString(buffer, offset);
        elem.filename = filenameResult.str;
        offset = filenameResult.newOffset;
    });

    fml.elements.forEach((elem) => {
        const symlinkResult = readFString(buffer, offset);
        elem.symlink_target = symlinkResult.str;
        offset = symlinkResult.newOffset;
    });

    fml.elements.forEach((elem) => {
        elem.hash = buffer.slice(offset, offset + 20);
        offset += 20;
    });

    fml.elements.forEach((elem) => {
        elem.flags = buffer.readUInt8(offset);
        offset += 1;
    });

    fml.elements.forEach((elem) => {
        const tagCount = buffer.readUInt32LE(offset);
        offset += 4;
        for (let i = 0; i < tagCount; i++) {
            const tagResult = readFString(buffer, offset);
            elem.install_tags.push(tagResult.str);
            offset = tagResult.newOffset;
        }
    });

    fml.elements.forEach((elem) => {
        const partCount = buffer.readUInt32LE(offset);
        offset += 4;
        let fileOffset = 0;

        for (let i = 0; i < partCount; i++) {
            const partSize = buffer.readUInt32LE(offset);
            offset += 4;
            const guid = [buffer.readUInt32LE(offset), buffer.readUInt32LE(offset + 4), buffer.readUInt32LE(offset + 8), buffer.readUInt32LE(offset + 12)];
            offset += 16;
            const chunkOffset = buffer.readUInt32LE(offset);
            offset += 4;
            const size = buffer.readUInt32LE(offset);
            offset += 4;
            elem.chunk_parts.push({
                guid,
                offset: chunkOffset,
                size,
                file_offset: fileOffset
            });

            fileOffset += size;
        }

    });

    if (fml.version >= 1) {
        fml.elements.forEach((elem) => {
            const hasMd5 = buffer.readUInt32LE(offset);
            offset += 4;
            if (hasMd5 !== 0) {
                elem.hash_md5 = buffer.slice(offset, offset + 16);
                offset += 16;
            }
        });

        fml.elements.forEach((elem) => {
            const mimeTypeResult = readFString(buffer, offset);
            elem.mime_type = mimeTypeResult.str;
            offset = mimeTypeResult.newOffset;
        });
    }

    if (fml.version >= 2) {
        fml.elements.forEach((elem) => {
            elem.hash_sha256 = buffer.slice(offset, offset + 32);
            offset += 32;
        });
    }

    fml.elements.forEach((elem) => {
        elem.file_size = elem.chunk_parts.reduce((acc, part) => acc + part.size, 0);
    });

    return fml;
}

async function parseFileManifest(buffer) {
    let offset = 0;
    let fileManifest = {
        filename: '',
        symlink_target: '',
        hash: '',
        flags: 0,
        install_tags: [],
        chunk_parts: [],
        file_size: 0,
        hash_md5: '',
        mime_type: '',
        hash_sha256: '',
    };

    // Read filename
    let result = readFString(buffer, offset);
    fileManifest.filename = result.str;
    offset = result.newOffset;

    // Read symlink_target
    result = readFString(buffer, offset);
    fileManifest.symlink_target = result.str;
    offset = result.newOffset;

    // Read hash
    fileManifest.hash = buffer.toString('hex', offset, offset + 20);
    offset += 20;

    // Read flags
    fileManifest.flags = buffer.readInt32LE(offset);
    offset += 4;

    // Read install_tags
    let tagCount = buffer.readInt32LE(offset);
    offset += 4;
    for (let i = 0; i < tagCount; i++) {
        result = readFString(buffer, offset);
        fileManifest.install_tags.push(result.str);
        offset = result.newOffset;
    }

    // Read chunk_parts
    let partCount = buffer.readInt32LE(offset);
    offset += 4;
    for (let i = 0; i < partCount; i++) {
        let guid = buffer.slice(offset, offset + 16);
        offset += 16;
        let chunkPart = {
            guid: guid.toString('hex'),
            offset: buffer.readInt32LE(offset),
            size: buffer.readInt32LE(offset + 4),
            file_offset: buffer.readInt32LE(offset + 8)
        };
        offset += 12;
        fileManifest.chunk_parts.push(chunkPart);
    }

    // Read file_size
    fileManifest.file_size = buffer.readBigInt64LE(offset);
    offset += 8;

    // Read hash_md5
    fileManifest.hash_md5 = buffer.toString('hex', offset, offset + 16);
    offset += 16;

    // Read mime_type
    result = readFString(buffer, offset);
    fileManifest.mime_type = result.str;
    offset = result.newOffset;

    // Read hash_sha256
    fileManifest.hash_sha256 = buffer.toString('hex', offset, offset + 32);
    offset += 32;

    return {
        fm: fileManifest,
        offset
    };
}

function readFString(buffer, offset) {
    let length = buffer.readInt32LE(offset);
    offset += 4;
    let str = '';
    if (length < 0) {
        length = Math.abs(length) * 2;
        str = buffer.toString('utf16le', offset, offset + length - 2);
        offset += length;
    } else if (length > 0) {
        str = buffer.toString('ascii', offset, offset + length - 1);
        offset += length;
    }
    return {
        str,
        newOffset: offset
    };
}

function computeGroupNum(guid) {
    const buffer = Buffer.alloc(16);
    guid.forEach((g, index) => buffer.writeUInt32LE(g, index * 4));
    return crc32.buf(buffer) >>> 0 % 100; // Use unsigned right shift to ensure a positive number
}

function guidStr(guid) {
    return guid.map(g => g.toString(16).padStart(8, '0')).join('-').toLowerCase();
}

function guidNum(guid) {
    return guid[3] + (guid[2] << 32) + (guid[1] << 64) + (guid[0] << 96);
}

function computePath(manifestVersion, groupNum, hash, guid) {
    const chunkDir = utils.getChunkDir(manifestVersion);
    const hashStr = hash.toString(16).toUpperCase().padStart(16, '0');
    const guidStr = guid.map(g => g.toString(16).toUpperCase().padStart(8, '0')).join('');
    return `${chunkDir}/${groupNum.toString().padStart(2, '0')}/${hashStr}_${guidStr}.chunk`;
}
