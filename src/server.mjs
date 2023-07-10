import Fastify from 'fastify'

import fs from 'fs/promises';
import { URL } from 'url';

import { download } from './download.mjs';
import { archive } from './archive.mjs';
import { upload, getUrl } from './s3.mjs';
import { clean } from './clean.mjs';

import config from '../config.mjs';

export {
    server
};

const fastify = Fastify({
    logger: true
});

const appNameSantizer = new RegExp(/^[\w-.]+$/);

fastify.get('/api/request/:appName', async (request, reply) => {

    const { appName } = request.params;

    if (!appNameSantizer.test(appName)) {
        return reply.code(400).send({ error: 'Invalid appName' });
    }

    const statusFile = (`${config.DATA_DIR}/status/${appName}.json`);

    try {

        await updateStatus(statusFile, { status: 'downloading', progress: 0, url: '' });

        handleTasks(appName, statusFile);

        reply.code(202).send({ status: 'ok', message: 'Download started' });

    } catch (err) {

        reply.code(500).send({ status: 'error', error: err });

    }

});

fastify.get('/api/download/:appName', async (request, reply) => {

    const { appName } = request.params;

    if (!appNameSantizer.test(appName)) {
        return reply.code(400).send({ error: 'Invalid appName' });
    }

    const statusFile = (`${config.DATA_DIR}/status/${appName}.json`);
    const status = await readStatus(statusFile);

    if (status.status !== 'complete') {
        return reply.code(200).send(status);
    }

    let url = new URL(await getUrl(appName));

    console.log(JSON.stringify(url));

    if (config.DOWNLOAD) {
        console.log('replacing download link')
        url.hostname = config.DOWNLOAD;
    }

    status.url = url;

    reply.code(200).send(status);

});

async function readStatus(file) {

    const data = await fs.readFile(file);
    return JSON.parse(data);

}

async function updateStatus(file, status) {

    await fs.writeFile(file, JSON.stringify(status));

}

async function handleTasks(appName, statusFile) {

    try {

        updateStatus(statusFile, {
            status: 'downloading',
            progress: 0.3,
            url: ''
        });
        console.log(`Server: Downloading ${appName}`);
        await download(appName);

        updateStatus(statusFile, {
            status: 'packaging',
            progress: 0.5,
            url: ''
        });
        console.log(`Server: Archiving ${appName}`);
        await archive(appName);


        updateStatus(statusFile, {
            status: 'uploading',
            progress: 0.8,
            url: ''
        });
        console.log(`Server: Uploading ${appName}`);
        await upload(appName);


        updateStatus(statusFile, {
            status: 'complete',
            progress: 1,
            url: ''
        });

        await clean(`asset/${appName}`);
        await clean(`archive/${appName}.zip`);

        console.log(`Server: Completed ${appName}`);


    } catch (err) {

        console.error(`Error occurred in handleTasks: ${err}`);

        await updateStatus(statusFile, { status: 'error', progress: 0, url: '', error: err });

    }
}

async function server() {

    try {
        await fs.access(`${config.DATA_DIR}/status`);
    } catch (err) {
        console.error(`Error accessing status directory: ${err}`);
        await fs.mkdir(`${config.DATA_DIR}/status`, { recursive: true });
    }

    fastify.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
        if (err) throw err;
        fastify.log.info(`server listening on ${address}`);
    });

}
