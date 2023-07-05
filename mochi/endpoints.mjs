const EPICAPI = {
    login: "https://www.epicgames.com/id/login?redirectUrl=",
    redirect: `https://www.epicgames.com/id/api/redirect?clientId=${clientId}&responseType=code`,
    auth_code: "https://account-public-service-prod.ak.epicgames.com/account/api/oauth/token",
    vault: "https://library-service.live.use1a.on.epicgames.com/library/api/public/items",
    manifest: `https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/v2/platform/Windows/namespace/ue/catalogItem/${catalogItemId}/app/${appName}/label/Live`,
    chunk: `http://download.epicgames.com/Builds/Rocket/Automated/${AppNameString}/CloudDir/ChunksV3/${DataGroup}/${hash}_${guid}.chunk`
}

exports = EPICAPI;
