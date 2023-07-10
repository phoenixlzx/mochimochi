import fs from 'fs/promises';

import config from '../config.mjs';

export {
    clean
};

async function clean(args) {

    if (!args) return;

    try {
        console.log(`Clean up: ${config.DATA_DIR}/${args}`)
        await fs.rm(`${config.DATA_DIR}/${args}`, { recursive: true, force: true });
    } catch (err) {
        console.error(`Error while deleting ${args}: ${err}`);
        return err;
    }

}
