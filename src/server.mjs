import fastify from 'fastify';
import * as fs from 'fs/promises';

import download from 'download.mjs';
import archive from 'archive.mjs';
import {upload, getSignedUrl } from 's3.mjs';


const appNameSantizer = new RegExp(/^[\w-.]+$/);

fastify.get('/api/request/:appName', async (request, reply) => {

    const { appName } = request.params;

    if (!appNameSantizer.test(appName)) {
        return reply.code(400).send({ error: 'Invalid appName' });
    }

    const statusFile = (`status/${appName}.json`);

    try {

        await updateStatus(statusFile, { status: 'downloading', progress: 0.3, url: '' });

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

    const statusFile = (`status/${appName}.json`);
    const status = await readStatus(statusFile);

    if (status.status !== 'complete') {
        return reply.code(200).send(status);
    }

    const url = await getSignedUrl(appName);
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

    let overAllProgress = 0;

    try {

        // download
        const onDownloadProgress = async (progress) => {
            overAllProgress = progress * 0.3;
            const status = { status: 'downloading', progress: overAllProgress, url: '' };
            await updateStatus(statusFile, JSON.stringify(status));
        };

        const downloadEmitter = download(appName);
        downloadEmitter.on('progress', onDownloadProgress);

        await new Promise((resolve, reject) => {
            downloadEmitter.on('complete', resolve);
            downloadEmitter.on('error', reject);
        });

        downloadEmitter.off('progress', onDownloadProgress);

        // archive
        const onArchiveProgress = async (progress) => {
            overAllProgress = 0.3 + progress * 0.3;
            const status = { status: 'packaging', progress: overAllProgress, url: '' };
            await updateStatus(statusFile, JSON.stringify(status));
        };

        const archiveEmitter = archive(appName);
        archiveEmitter.on('progress', onArchiveProgress);

        await new Promise((resolve, reject) => {
            archiveEmitter.on('complete', resolve);
            archiveEmitter.on('error', reject);
        });

        archiveEmitter.off('progress', onArchiveProgress);

        // upload
        const uploader = await upload(appName);
        uploader.on('httpUploadProgress', (progress) => {
            overAllProgress = 0.6 + progress.loaded / progress.total * 0.3
            updateStatus(statusFile, {
                status: 'synchronizing',
                progress: overAllProgress,
                url: ''
            });
        });

        await uploader.done();

        updateStatus(statusFile, {
            status: 'complete',
            progress: 1,
            url: ''
        });

        // TODO clean up

    } catch (err) {

        console.error(err);

        const status = { status: 'error', progress: 0, url: '' };

        await writeFile(statusFile, JSON.stringify(status));

    }
}

fastify.listen(3000, (err, address) => {
    if (err) throw err;
    fastify.log.info(`server listening on ${address}`);
});
