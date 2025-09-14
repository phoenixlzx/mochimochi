import EventEmitter from 'events';
import fetch from 'node-fetch';

export {
    ProcessManager,
    fetchJson,
    blob2hex,
    hex2blob,
    hex2bin,
    bin2hex,
    splitStr,
    dec2hex,
    hex2dec,
    bigInt2blob,
    num2blob,
    blob2num,
    getChunkDir
};

class ProcessManager extends EventEmitter {

    constructor(items, options, threadFunc, maxConcurrency = 1, rateLimitMs = 0) {
        super();
        this.items = items;
        this.options = options;
        this.threadFunc = threadFunc;
        this.maxConcurrency = maxConcurrency;
        this.rateLimitMs = rateLimitMs;
        this.currentIndex = 0;
        this.completedCount = 0;
        this.lastRequestTime = 0;
    }

    async processItem() {
        if (this.currentIndex < this.items.length) {
            const item = this.items[this.currentIndex++];
            
            if (this.rateLimitMs > 0) {
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.rateLimitMs) {
                    await new Promise(resolve => setTimeout(resolve, this.rateLimitMs - timeSinceLastRequest));
                }
                this.lastRequestTime = Date.now();
            }
            
            await this.threadFunc(item, this.options);
            this.completedCount++;
            this.emit('progress', this.completedCount / this.items.length);
            if (this.completedCount === this.items.length) {
                this.emit('complete');
            }
            return this.processItem();
        }
    }

    async process() {
        const workers = Array.from({
            length: this.maxConcurrency
        }, () => this.processItem());
        return await Promise.all(workers);
    }

}

async function fetchJson(url, headers, method = 'GET', body = null) {

    const options = {
        method: method,
        headers: headers
    };

    if (body) {
        options.body = body;
    }

    const response = await fetch(url, options);

    return await response.json();

}

// https://github.com/VastBlast/EpicManifestDownloader/
function blob2hex(blob, reverse = true, returnInt = false) {

    let sets = splitStr(blob, 3); //divide all chars into sets of three (array)
    reverse ? sets.reverse() : false;
    let out = '';

    for (let val of sets) {
        out += dec2hex(val);
    }

    return (returnInt) ? (hex2dec(out, true)) : (out.toUpperCase());

}

function hex2bin(hexSource) {

    const bin = Buffer.from(hexSource, 'hex').toString();
    return bin;

}

function bin2hex(binSource) {
    const hex = Buffer.from(binSource, 'utf8').toString("hex");
    return hex;
}

function splitStr(str, splitLength = 1) {
    let sets = [];
    for (let i = 0, charsLength = str.length; i < charsLength; i += splitLength) {
        sets.push(str.substring(i, i + splitLength));
    }
    return sets;
}

function dec2hex(dec) { //integer to hex
    let hex = parseInt(dec).toString(16);
    if (hex.length == 1) {
        hex = '0' + hex; //adds leading zero
    }
    return hex;
}

function hex2dec(hex, bigStr = false) {
    //returns string, used for long ints or int if false
    return (bigStr) ? BigInt('0x' + hex).toString(10) : parseInt(hex, 16)
}

function hex2blob(hexString, reverse = false) {
    const buffer = Buffer.from(hexString, 'hex');
    let blob = '';

    for (let i = 0; i < buffer.length; i++) {
        const decimalString = buffer[i].toString().padStart(3, '0');
        blob = decimalString + blob;
    }

    return blob;
}

function bigInt2blob(bigIntValue, reverse = false) {

    const byteLength = 8;
    const buffer = Buffer.alloc(byteLength);
    for (let i = 0; i < byteLength; i++) {
        buffer[byteLength - 1 - i] = Number(bigIntValue >> BigInt(8 * i) & BigInt(0xFF));
    }

    let blob = '';
    for (let i = 0; i < buffer.length; i++) {
        const decimalString = buffer[i].toString().padStart(3, '0');
        blob += decimalString;
    }

    if (reverse) {
        let sets = splitStr(blob, 3);
        sets.reverse();
        blob = '';
        for (let val of sets) {
            blob += val;
        }
    }

    return blob;
}

function num2blob(num, targetLength) {
    let blob = "";
    while (num) {
        let part = num & 0xFF;
        num = num >> 8;
        blob = blob + part.toString().padStart(3, '0');
    }
    return blob.padEnd(targetLength, '0');
}

function blob2num(blobStr) {
    let num = 0;
    let shift = 0;

    for (let i = 0; i < blobStr.length; i += 3) {
        const part = parseInt(blobStr.substring(i, i + 3), 10);
        num += (part << shift);
        shift += 8;
    }

    return num;
}

function getChunkDir(version) {
    if (version >= 15) {
        return 'ChunksV4';
    } else if (version >= 6) {
        return 'ChunksV3';
    } else if (version >= 3) {
        return 'ChunksV2';
    } else {
        return 'Chunks';
    }
}
