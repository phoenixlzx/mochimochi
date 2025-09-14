import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';
import archiver from 'archiver';
import { writeStatus } from './status.mjs';
import config from '../config.mjs';

export { archive };

async function archive(app) {
    if (!app) return;

    const srcDir = `${config.DATA_DIR}/asset/`;
    const destDir = `${config.DATA_DIR}/archive/`;
    const source = `${srcDir}${app}`;
    const destination = `${destDir}${app}.zip`;

    try {
        await fs.access(source);
    } catch (err) {
        throw new Error(`Source directory not found: ${source}`);
    }

    const files = await walk(source);
    const archive = archiver('zip', {
        zlib: { level: 0 },
        store: true
    });

    const zipOutput = createWriteStream(destination);

    zipOutput.on('close', () => console.log(`Zip saved to ${destination}`));
    zipOutput.on('end', () => console.log('Data has been drained'));

    archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
            console.log(err);
        } else {
            throw err;
        }
    });

    archive.on('error', function(err) {
        throw err;
    });

    archive.pipe(zipOutput);

    for (const [index, file] of files.entries()) {
        const name = file.replace(srcDir, '');
        const readStream = createReadStream(file);

        console.log(`Zipping ${file}`);
        await writeStatus(app, {
            status: 'Zipping up',
            progress: (index + 1) / files.length
        });

        archive.append(readStream, { name: name });
    }

    await archive.finalize();
}

async function walk(dir) {
    let files = [];
    const dirents = await fs.readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        const res = join(dir, dirent.name);
        if (dirent.isDirectory()) {
            files = files.concat(await walk(res));
        } else {
            files.push(res);
        }
    }
    return files;
}
