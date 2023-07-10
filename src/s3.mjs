import { S3Client, GetObjectCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from "@aws-sdk/lib-storage";
import fs from 'fs/promises';

export {
    upload,
    getSignedUrl
};

const s3params = {/* TODO read S3 config */ };

const s3Client = new S3Client(s3params);

async function upload(appName) {

    const zipFilePath = `data/archive/${appName}.zip`;

    try {

        await fs.access(zipFilePath);

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: s3params.BUCKET_NAME,
                Key: `${appName}.zip`,
                Body: fs.createReadStream(zipFilePath),
            },
        });

        upload.on('httpUploadProgress', (progress) => {
            console.log(`Uploading ${zipFilePath}: ${Math.round(progress.loaded / progress.total * 100)}%`);
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
            console.log(`Abort upload of ${zipFilePath}`);
        }

        return;

    }

}

async function getSignedUrl(appName) {
    const command = new GetObjectCommand({
        Bucket: s3params.BUCKET_NAME,
        Key: `${appName}.zip`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600  // Expires in 1 hour
    });

    return signedUrl;
}
