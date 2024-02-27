export {
    ENDPOINTS,
    VARS
};

const ENDPOINTS = {

    login: function(clientId) {
        return "https://www.epicgames.com/id/login?redirectUrl=" +
            encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${clientId}&responseType=code`);
    },

    auth_code: "https://account-public-service-prod.ak.epicgames.com/account/api/oauth/token",

    refresh_token: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/verify",

    vault: "https://library-service.live.use1a.on.epicgames.com/library/api/public/items",

    detail: function(catalogItemId) {
        return `https://www.unrealengine.com/marketplace/api/assets/item/${catalogItemId}`;
    },

    manifest: function(catalogItemId, appName) {
        return `https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/v2/platform/Windows/namespace/ue/catalogItem/${catalogItemId}/app/${appName}/label/Live`
    },

    // deprecated
    chunk: function(appNameString, dataGroup, hash, guid) {
        return `http://download.epicgames.com/Builds/Rocket/Automated/${appNameString}/CloudDir/ChunksV3/${dataGroup}/${hash}_${guid}.chunk`;
    }

};

const VARS = {

    // https://github.com/MixV2/EpicResearch/blob/master/docs/auth/permissions/34a02cf8f4414e29b15921876da36f9a.md
    client_id: "34a02cf8f4414e29b15921876da36f9a",
    client_cred: "daafbccc737745039dffe53d94fc76cf",
    client_cred_base64: "MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
    client_ua: "EpicGamesLauncher/16.0.1-31615183+++Portal+Release-Live Windows/10.0.22621.1.256.64bit",

    date_options: {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
    }

}
