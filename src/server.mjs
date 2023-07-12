import Fastify from 'fastify'

import { URL } from 'url';

import { download } from './download.mjs';
import { archive } from './archive.mjs';
import { upload, getUrl } from './s3.mjs';
import { clean } from './clean.mjs';

import { readStatus, writeStatus } from './status.mjs';

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

    const status = await readStatus(appName);

    if (status.status) {
        return reply.code(200).send(status);
    } else {
        console.error(`Server: ${appName} status not found. Now starting.`)
    }

    try {
        handleTasks(appName);
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

    const status = await readStatus(appName);

    if (status.status !== 'complete') {
        return reply.code(200).send(status);
    }

    let url = new URL(await getUrl(appName));
    status.url = url;

    reply.code(200).send(status);

});

async function handleTasks(appName) {

    try {

        console.log(`Server: Downloading ${appName}`);
        await download(appName);

        console.log(`Server: Archiving ${appName}`);
        await archive(appName);

        console.log(`Server: Uploading ${appName}`);
        await upload(appName);

        await writeStatus(appName, {
            status: 'complete',
            progress: 1
        });

        console.log(`Server: Completed ${appName}`);
        await serverCleanup(appName);

    } catch (err) {

        console.error(`Error occurred in handleTasks: ${err}`);

        await writeStatus(appName, { status: 'error', progress: 0, error: err });
        await serverCleanup(appName);

    }
}

async function serverCleanup(appName) {
    await clean(`${config.DATA_DIR}/asset/${appName}`);
    await clean(`${config.DATA_DIR}/archive/${appName}.zip`);
}

async function server() {

    fastify.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
        if (err) throw err;
        fastify.log.info(`server listening on ${address}`);
    });

}
