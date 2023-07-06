import { createWriteStream } from 'fs';
import { access, mkdir, readFile } from 'fs/promises';

import { Zip, ZipPassThrough } from 'fflate';
import { walk } from '@root/walk';

export {
    archive
};

async function archive(app) {

    if (!app) return;

    const srcDir = "data/asset/";
    const destDir = "data/archive/";
    const source = `${srcDir}${app}`;
    const destination = `${destDir}${app}.zip`;

    try {
        await access(source);
        await mkdir(destDir, { recursive: true });
    } catch (err) {
        console.error(`Error ensure source/destination: ${err}`);
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

    for (const file of files) {
        const fileToAdd = new ZipPassThrough(file.slice(file.indexOf(app)));
        console.log(`Zipping ${file}`);
        zip.add(fileToAdd);
        fileToAdd.push(await readFile(file), true);
    }

    zip.end();

}
