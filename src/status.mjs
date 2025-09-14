import fs from 'fs/promises';

import config from '../config.mjs';

export {
    readStatus,
    writeStatus,
    readAllStatus
};

async function readStatus(appName) {
    if (!appName) {
        return await readAllStatus();
    }

    try {
        const s = JSON.parse(await fs.readFile(`${config.DATA_DIR}/public/status/${appName}.json`, 'utf8'));
        return s;
    } catch (err) {
        console.error(`Error reading status for ${appName}: ${err}`);
        return {};
    }

}

async function writeStatus(appName, statusObj) {
    if (!appName) return;

    try {
        await fs.access(`${config.DATA_DIR}/public/status`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fs.mkdir(`${config.DATA_DIR}/public/status`, { recursive: true });
        }
    }

    try {
        await fs.writeFile(`${config.DATA_DIR}/public/status/${appName}.json`, JSON.stringify(statusObj));
    } catch (err) {
        console.error(`Error updating status for ${appName}: ${err}`);
    }
}

async function readAllStatus() {
    try {

        const statusFiles = await fs.readdir(`${config.DATA_DIR}/public/status`);
        let statuses = {};

        for (const s of statusFiles) {
            try {
                statuses[s.slice(0, s.lastIndexOf('.json'))] = JSON.parse(await fs.readFile(`${config.DATA_DIR}/public/status/${s}`));
            } catch (err) {
                console.error(`Error reading status file ${s}: ${err}`);
            }
        }

        return statuses;

    } catch (err) {

        console.error(`Error reading status: ${err}`);
        return {};

    }
}
