import { S3Client, GetObjectCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from "@aws-sdk/lib-storage";
import fs from 'fs/promises';
import { createReadStream } from 'fs';

import { writeStatus } from './status.mjs';

import config from '../config.mjs';

export {
    upload,
    getUrl
};

const s3Client = new S3Client(config.S3);

async function upload(appName) {

    const zipFilePath = `${config.DATA_DIR}/archive/${appName}.zip`;

    try {

        await fs.access(zipFilePath);

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: config.S3.bucket,
                Key: `${appName}.zip`,
                Body: createReadStream(zipFilePath),
            },
        });

        upload.on('httpUploadProgress', async (progress) => {
            console.log(`Uploading ${zipFilePath}: ${Math.ceil(progress.loaded / progress.total * 100)}%`);
            await writeStatus(app, {
                status: 'Uploading',
                progress: progress
            });
        });

        const result = await upload.done();

        return result;

    } catch (err) {

        console.error(`Error uploading ${zipFilePath}: ${err}`);

        if (err.$metadata) {
            const abortCommand = new AbortMultipartUploadCommand({
                Bucket: BUCKET_NAME,
                Key: `${appName}.zip`,
                UploadId: err.$metadata.requestId,
            });

            await s3Client.send(abortCommand);
            console.error(`Abort upload of ${zipFilePath}: ${err}`);
        }

        return;

    }

}

async function getUrl(appName) {
    const command = new GetObjectCommand({
        Bucket: config.S3.bucket,
        Key: `${appName}.zip`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600  // Expires in 1 hour
    });

    return signedUrl;
}
