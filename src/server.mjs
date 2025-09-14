import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
    logger: true
});

const appNameSantizer = new RegExp(/^[\w-.]+$/);

let activeTasks = {};

fastify.get('/api/request/:appName', async (request, reply) => {

    const { appName } = request.params;

    if (!appNameSantizer.test(appName)) {
        return reply.code(400).send({ error: 'Invalid appName' });
    }

    const status = await readStatus(appName);

    if (status.status && status.status !== 'error') {
        return reply.code(200).send(status);
    } else {
        console.error(`Server: ${appName} status not found or error. Now (re)starting.`)
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

    if (activeTasks[appName]) return;

    activeTasks[appName] = 1;

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

        await serverCleanup(appName);
        console.log(`Server: Completed ${appName}`);

    } catch (err) {

        await writeStatus(appName, { status: 'error', progress: 0, error: err });
        await serverCleanup(appName);
        console.error(`Error occurred in handleTasks: ${err}`);

    }

    delete activeTasks[appName];

}

async function serverCleanup(appName) {
    await clean(`asset/${appName}`);
    await clean(`archive/${appName}.zip`);
}

async function server() {

    await fastify.register(fastifyStatic, {
        root: join(__dirname, '..', 'public'),
        prefix: '/'
    });

    await fastify.register(fastifyStatic, {
        root: join(__dirname, '..', 'data', 'public'),
        prefix: '/data/',
        decorateReply: false
    });

    fastify.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
        if (err) throw err;
        fastify.log.info(`server listening on ${address}`);
    });

}
