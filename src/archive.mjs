import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';

import { Zip, ZipPassThrough } from 'fflate';

import { writeStatus } from './status.mjs';

import config from '../config.mjs';

export {
    archive
};

async function archive(app) {

    if (!app) return;

    const srcDir = `${config.DATA_DIR}/asset/`;
    const destDir = `${config.DATA_DIR}/archive/`;
    const source = `${srcDir}${app}`;
    const destination = `${destDir}${app}.zip`;

    try {
        await fs.access(source);
    } catch (err) {
        console.error(`Error accessing source: ${err}`);
        return;
    }


    const files = await walk(source);

    const zipStream = createWriteStream(destination);
    const zip = new Zip();

    zip.ondata = (err, data, final) => {

        if (err) {
            console.error(`Error zip: ${err}`);
        }

        zipStream.write(data);

        if (final) {
            zipStream.end();
            console.log(`Zip saved to ${destination}`);
        }

    }

    for (const [index, file] of files.entries()) {
        const relativePath = file.slice(file.indexOf(app));
        const readStream = createReadStream(file);
        const fileToAdd = new ZipPassThrough(relativePath);

        console.log(`Zipping ${file}`);
        await writeStatus(app, {
            status: 'Zipping up',
            progress: (index + 1) / files.length
        });

        readStream.on('data', chunk => {
            if (!fileToAdd.push(chunk)) {
                readStream.pause();
                process.nextTick(() => {
                    readStream.resume();
                });
            }
        });

        readStream.on('end', () => {
            fileToAdd.push(null, true);
        });

        readStream.on('error', err => {
            console.error(`Error reading file ${file}: ${err}`);
        });

        zip.add(fileToAdd);
    }

    zip.end();

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
