import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';
import ZipStream from 'zip-stream';
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
        console.error(`Error accessing source: ${err}`);
        return;
    }

    const files = await walk(source);
    const archive = new ZipStream({ zip64: true });

    archive.pipe(createWriteStream(destination));

    for (const [index, file] of files.entries()) {
        const name = file.replace(srcDir, '');
        const readStream = createReadStream(file);

        console.log(`Zipping ${file}`);
        await writeStatus(app, {
            status: 'Zipping up',
            progress: (index + 1) / files.length
        });

        archive.entry(readStream, { name: name }, err => {
            if (err) console.error(`Error zipping file ${file}: ${err}`);
        });
    }

    archive.finalize();

    console.log(`Zip saved to ${destination}`);
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
