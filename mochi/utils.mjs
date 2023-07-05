export {
    processManager,
    blob2hex,
    hex2bin,
    bin2hex,
    splitStr,
    dec2hex,
    hex2dec
};

async function processManager(items, threadFunc, maxConcurrency = 1) {
  let currentIndex = 0;

  function launch() {
    if (currentIndex === items.length) return Promise.resolve();

    const item = items[currentIndex++];
    return threadFunc(item).then(launch);
  }

  const workers = Array.from({ length: maxConcurrency }, launch);
  await Promise.all(workers);
}

// https://github.com/VastBlast/EpicManifestDownloader/
function blob2hex(blob, reverse = true, returnInt = false) {
    let sets = splitStr(blob, 3); //divide all chars into sets of three (array)
    reverse ? sets.reverse() : false;
    let out = '';
    for (var val of sets) {
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
    for (var i = 0, charsLength = str.length; i < charsLength; i += splitLength) {
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
