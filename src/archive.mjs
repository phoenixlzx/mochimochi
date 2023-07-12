import { createWriteStream } from 'fs';
import fs from 'fs/promises';

import { Zip, ZipPassThrough } from 'fflate';
import { walk } from '@root/walk';

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

    let files = [];

    await walk(source, async (err, pathname, dirent) => {

        if (err) {
            console.error(`Error reading directory: ${err}`);
        }

        if (dirent.isFile()) {
            files.push(pathname);
        }

    });

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

        const fileToAdd = new ZipPassThrough(file.slice(file.indexOf(app)));
        console.log(`Zipping ${file}`);
        await writeStatus(app, {
            status: 'Zipping up',
            progress: (index + 1) / files.length
        });

        zip.add(fileToAdd);
        fileToAdd.push(await fs.readFile(file), true);

    }

    zip.end();

}
