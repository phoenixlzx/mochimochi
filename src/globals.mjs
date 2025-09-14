export {
    ENDPOINTS,
    VARS
};

const ENDPOINTS = {

    login: function (clientId) {
        return "https://www.epicgames.com/id/login?redirectUrl=" +
            encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${clientId}&responseType=code`);
    },

    auth_token: "https://account-public-service-prod.ak.epicgames.com/account/api/oauth/token",

    refresh_token: "https://account-public-service-prod.ak.epicgames.com/account/api/oauth/token",

    exchange: "https://account-public-service-prod.ak.epicgames.com/account/api/oauth/exchange",

    ue_library: function (accountId) {
        return `https://www.fab.com/e/accounts/${accountId}/ue/library?count=100`;
    },

    detail: function (catalogItemId) {
        return `https://www.fab.com/api/v1/assets/${catalogItemId}`;
    },

    fab_manifest: function (artifactId) {
        return `https://www.fab.com/e/artifacts/${artifactId}/manifest`;
    },

    bulk_catalog: "https://catalog-public-service-prod.ak.epicgames.com/catalog/api/shared/bulk/namespaces/items?includeDLCDetails=false&includeMainGameDetails=false&country=US&locale=en"

};

const VARS = {

    // https://github.com/MixV2/EpicResearch/blob/master/docs/auth/permissions/34a02cf8f4414e29b15921876da36f9a.md
    client_id: "34a02cf8f4414e29b15921876da36f9a",
    client_cred: "daafbccc737745039dffe53d94fc76cf",
    client_cred_base64: "MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
    client_ua: "UELauncher/18.9.0-45233261+++Portal+Release-Live Windows/10.0.26100.1.256.64bit",

    date_options: {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
    }

}
