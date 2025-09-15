function vaultManager() {
    return {
        searchQuery: '',
        assets: [],
        allAssets: [],
        currentPage: 1,
        itemsPerPage: 20,
        totalPages: 1,
        selectedAsset: null,
        categoryFilter: '',
        listingTypeFilter: '',
        availableCategories: [],
        availableListingTypes: [],
        loadedCount: 0,
        currentRoute: 'home',
        router: null,
        scrollPosition: 0,
        directAssetLoaded: false,

        async init() {
            // Check if we're directly accessing an asset URL BEFORE initializing router
            const hash = window.location.hash.substring(1);
            const isDirectAssetAccess = hash.startsWith('asset/');

            if (isDirectAssetAccess) {
                // For direct asset access, load the asset first, then init router
                const assetId = hash.split('/')[1];
                await this.loadSingleAsset(assetId);
                
                // Now initialize router after asset is loaded
                try {
                    this.initRouter();
                } catch (error) {
                    console.error('Router initialization failed:', error);
                    this.currentRoute = 'home';
                }
                return;
            }

            // Normal initialization - init router first, then load all assets
            try {
                this.initRouter();
            } catch (error) {
                console.error('Router initialization failed:', error);
                this.currentRoute = 'home';
            }

            await this.loadAllAssets();
        },

        async loadAllAssets() {
            const response = await fetch(`/data/vault.json?t=${Date.now()}`);
            const vaultAssets = await response.json();

            this.allAssets = this.processVaultAssets(vaultAssets);
            await this.loadAssetDetails();
            this.buildFilters();
            this.loadPage();
        },

        async loadSingleAsset(assetId) {
            try {
                // First, try to load the asset detail
                const assetDetail = await this.loadAssetDetailById(assetId);
                if (!assetDetail) {
                    await this.loadAllAssets();
                    return;
                }

                // Also load vault data to get release info
                const vaultAsset = await this.loadVaultAssetById(assetId);

                // Merge vault data with detail data
                if (vaultAsset) {
                    assetDetail.releaseInfo = vaultAsset.releaseInfo || assetDetail.releaseInfo;
                    assetDetail.compatibleApps = vaultAsset.compatibleApps || assetDetail.compatibleApps;
                }

                this.allAssets = [assetDetail];
                this.loadedCount = 1;
                
                // Set the route and selected asset directly since we loaded it
                this.currentRoute = 'asset';
                this.openAsset(assetDetail);
                this.directAssetLoaded = true;
                window.scrollTo(0, 0);
            } catch (error) {
                console.error('Failed to load single asset:', error);
                await this.loadAllAssets();
            }
        },

        async loadVaultAssetById(assetId) {
            try {
                const response = await fetch(`/data/vault.json?t=${Date.now()}`);
                const vaultAssets = await response.json();

                // Find the asset in vault data
                const vaultAsset = vaultAssets.find(asset =>
                    asset.catalogItemId === assetId ||
                    asset.listingIdentifier === assetId ||
                    asset.catalogItemId?.replace(/-/g, '') === assetId ||
                    asset.listingIdentifier?.replace(/-/g, '') === assetId
                );

                if (!vaultAsset) return null;

                // Process the single vault asset similar to processVaultAssets
                const cleanVersions = vaultAsset.engineVersions?.map(v => v.replace('UE_', '')) || [];
                return {
                    catalogItemId: vaultAsset.catalogItemId,
                    listingIdentifier: vaultAsset.listingIdentifier,
                    compatibleApps: cleanVersions,
                    releaseInfo: [{
                        appId: vaultAsset.artifactId || vaultAsset.appName,
                        platform: 'Windows',
                        dateAdded: new Date().toISOString(),
                        engineVersion: cleanVersions[0] || 'Unknown',
                        supportedEngines: cleanVersions.length > 0 ? cleanVersions : ['Unknown']
                    }]
                };
            } catch (error) {
                console.error('Failed to load vault asset:', error);
                return null;
            }
        },

        async loadAssetDetailById(assetId) {
            try {
                // Try different possible file names for the asset
                const possibleFiles = [
                    `${assetId}.json`,
                    `${assetId.replace(/-/g, '')}.json`,
                    // Also try with dashes if the original doesn't have them
                    assetId.length === 32 ? `${assetId.slice(0, 8)}-${assetId.slice(8, 12)}-${assetId.slice(12, 16)}-${assetId.slice(16, 20)}-${assetId.slice(20)}.json` : null
                ].filter(Boolean);

                let response;
                let detail;

                for (const fileName of possibleFiles) {
                    try {
                        response = await fetch(`/data/detail/${fileName}`);
                        if (response.ok) {
                            detail = await response.json();
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!detail) {
                    return null;
                }

                const data = detail.data?.data || detail;

                return {
                    catalogItemId: data.catalogItemId || assetId,
                    listingIdentifier: data.listingIdentifier || assetId,
                    primaryId: assetId,
                    title: data.title || 'Untitled',
                    appId: data.appId || assetId,
                    loaded: true,
                    thumbnail: data.keyImages?.find(img => img.type === 'Thumbnail')?.url ||
                        data.keyImages?.find(img => img.type === 'Featured')?.url ||
                        data.keyImages?.find(img => img.type === 'Screenshot')?.url || '',
                    category: data.categories?.map(c => c.name || c.path?.split('/').pop()).filter(Boolean).join(', ') || '',
                    author: data.seller?.name || data.developer || '',
                    description: data.description || '',
                    longDescription: data.longDescription || '',
                    technicalDetails: data.technicalDetails || '',
                    listingType: data.listingType || '',
                    keyImages: data.keyImages || [],
                    licenses: data.licenses || [],
                    assetFormats: data.assetFormats || [],
                    platforms: (data.platforms || []).map(p =>
                        typeof p === 'string' ? { key: p.toLowerCase(), value: p } : p
                    ),
                    compatibleApps: data.compatibleApps || [],
                    releaseInfo: data.releaseInfo || [{
                        appId: data.appId || assetId,
                        platform: 'Windows',
                        dateAdded: new Date().toISOString(),
                        engineVersion: 'Unknown',
                        supportedEngines: ['Unknown']
                    }],
                    url: data.listingIdentifier ? `https://www.fab.com/listings/${formatUUID(data.listingIdentifier)}` : ''
                };
            } catch (error) {
                console.error('Failed to load single asset:', error);
                return null;
            }
        },

        processVaultAssets(vaultAssets) {

            // Group by unique identifier and merge versions
            const assetGroups = new Map();

            vaultAssets.forEach(asset => {
                const key = asset.catalogItemId || asset.listingIdentifier;
                if (!key) return;

                if (!assetGroups.has(key)) {
                    assetGroups.set(key, []);
                }
                assetGroups.get(key).push(asset);
            });

            // For each group, merge versions and create release info
            const uniqueAssets = [];
            assetGroups.forEach(versions => {
                // Sort by artifactId to get the most recent version (higher version numbers/newer artifacts)
                versions.sort((a, b) => {
                    const aId = a.artifactId || a.appName || '';
                    const bId = b.artifactId || b.appName || '';

                    // Extract version numbers if present (e.g., V4, V3, etc.)
                    const aVersionMatch = aId.match(/V(\d+)$/);
                    const bVersionMatch = bId.match(/V(\d+)$/);

                    if (aVersionMatch && bVersionMatch) {
                        return parseInt(bVersionMatch[1]) - parseInt(aVersionMatch[1]);
                    }

                    // Extract UE version numbers (e.g., 5.4, 5.3, etc.)
                    const aUEMatch = aId.match(/(\d+\.\d+)/);
                    const bUEMatch = bId.match(/(\d+\.\d+)/);

                    if (aUEMatch && bUEMatch) {
                        return parseFloat(bUEMatch[1]) - parseFloat(aUEMatch[1]);
                    }

                    // Fall back to string comparison
                    return bId.localeCompare(aId);
                });

                const latest = versions[0];

                // Create releaseInfo from all versions BEFORE merging engine versions
                latest.releaseInfo = versions.map(version => {
                    const cleanVersions = version.engineVersions?.map(v => v.replace('UE_', '')) || [];
                    return {
                        appId: version.artifactId || version.appName,
                        platform: 'Windows',
                        dateAdded: new Date().toISOString(),
                        engineVersion: cleanVersions[0] || 'Unknown',
                        supportedEngines: cleanVersions.length > 0 ? cleanVersions : ['Unknown']
                    };
                });

                // Merge engine versions from all variants for display compatibility
                const allEngineVersions = new Set();
                versions.forEach(version => {
                    if (version.engineVersions) {
                        version.engineVersions.forEach(ev => allEngineVersions.add(ev));
                    }
                });

                latest.engineVersions = Array.from(allEngineVersions).sort();

                // Sort release info by engine version (newest first)
                latest.releaseInfo.sort((a, b) => {
                    const aVersion = parseFloat(a.engineVersion);
                    const bVersion = parseFloat(b.engineVersion);
                    return bVersion - aVersion;
                });

                uniqueAssets.push(latest);
            });

            return uniqueAssets.map(vaultAsset => {
                const primaryId = vaultAsset.catalogItemId || vaultAsset.listingIdentifier;
                const listingId = vaultAsset.listingIdentifier || vaultAsset.catalogItemId;
                const compatibleApps = vaultAsset.engineVersions ? vaultAsset.engineVersions.map(v => v.replace('UE_', '')) : [];
                return {
                    catalogItemId: vaultAsset.catalogItemId,
                    listingIdentifier: vaultAsset.listingIdentifier,
                    primaryId: primaryId,
                    title: vaultAsset.title || 'Untitled',
                    appId: vaultAsset.artifactId || vaultAsset.appName,
                    loaded: false,
                    thumbnail: '',
                    category: '',
                    author: '',
                    platforms: [],
                    compatibleApps: compatibleApps,
                    keyImages: [],
                    releaseInfo: vaultAsset.releaseInfo || [],
                    url: `https://www.fab.com/listings/${formatUUID(listingId)}`
                };
            });
        },

        async loadAssetDetails() {
            const batchSize = 10;
            for (let i = 0; i < this.allAssets.length; i += batchSize) {
                const batch = this.allAssets.slice(i, i + batchSize);
                const promises = batch.map(asset => this.loadAssetDetail(asset));
                await Promise.allSettled(promises);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        },

        async loadAssetDetail(asset) {
            try {
                let response;

                // Try listingIdentifier first (for assets with or without catalogItemId)
                if (asset.listingIdentifier) {
                    const listingFile = asset.listingIdentifier.replace(/-/g, '');
                    response = await fetch(`/data/detail/${listingFile}.json`);
                }

                // If that fails and we have catalogItemId, try catalogItemId
                if ((!response || !response.ok) && asset.catalogItemId) {
                    response = await fetch(`/data/detail/${asset.catalogItemId}.json`);
                }

                if (!response || !response.ok) {
                    asset.loaded = true;
                    this.loadedCount++;
                    this.loadPage();
                    return;
                }

                const detail = await response.json();
                const data = detail.data?.data || detail;

                asset.title = data.title || asset.title;
                asset.author = data.seller?.name || data.developer || '';
                asset.category = data.categories?.map(c => c.name || c.path?.split('/').pop()).filter(Boolean).join(', ') || '';
                asset.description = data.description || '';
                asset.longDescription = data.longDescription || '';
                asset.technicalDetails = data.technicalDetails || '';
                asset.listingType = data.listingType || '';
                asset.keyImages = data.keyImages || [];
                asset.licenses = data.licenses || [];
                asset.assetFormats = data.assetFormats || [];
                asset.thumbnail = data.keyImages?.find(img => img.type === 'Thumbnail')?.url ||
                    data.keyImages?.find(img => img.type === 'Featured')?.url ||
                    data.keyImages?.find(img => img.type === 'Screenshot')?.url || '';

                asset.platforms = (data.platforms || []).map(p =>
                    typeof p === 'string' ? { key: p.toLowerCase(), value: p } : p
                );



                // Preserve the releaseInfo created during vault processing
                // Only update if we don't already have releaseInfo from vault processing
                if (!asset.releaseInfo || asset.releaseInfo.length === 0) {
                    asset.releaseInfo = data.releaseInfo?.length ? data.releaseInfo : [{
                        appId: asset.appId,
                        platform: asset.platforms.map(p => p.value || p).join(', ') || 'Windows',
                        dateAdded: new Date().toISOString()
                    }];
                }

                if (data.listingIdentifier && !asset.listingIdentifier) {
                    asset.listingIdentifier = data.listingIdentifier;
                    asset.url = `https://www.fab.com/listings/${formatUUID(data.listingIdentifier)}`;
                }

                asset.loaded = true;
                this.loadedCount++;
                this.loadPage();
            } catch (error) {
                asset.loaded = true;
                this.loadedCount++;
                this.loadPage();
            }
        },



        get filteredAssets() {
            if (!Array.isArray(this.allAssets)) return [];

            let filtered = this.allAssets.filter(asset => asset && asset.loaded);

            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(asset =>
                    (asset.title || '').toLowerCase().includes(query) ||
                    (asset.category || '').toLowerCase().includes(query) ||
                    (asset.author || '').toLowerCase().includes(query) ||
                    (asset.description || '').toLowerCase().includes(query)
                );
            }

            if (this.categoryFilter) {
                filtered = filtered.filter(asset => asset.category === this.categoryFilter);
            }

            if (this.listingTypeFilter) {
                filtered = filtered.filter(asset => asset.listingType === this.listingTypeFilter);
            }

            return filtered || [];
        },

        buildFilters() {
            const loadedAssets = this.allAssets.filter(asset => asset.loaded);
            this.availableCategories = [...new Set(loadedAssets.map(asset => asset.category).filter(Boolean))].sort();
            this.availableListingTypes = [...new Set(loadedAssets.map(asset => asset.listingType).filter(Boolean))].sort();
        },

        performSearch() {
            this.currentPage = 1;
            this.loadPage();
        },

        clearFilters() {
            this.searchQuery = '';
            this.categoryFilter = '';
            this.listingTypeFilter = '';
            this.performSearch();
        },

        changePage(direction) {
            const filtered = this.filteredAssets;
            const maxPages = Math.ceil(filtered.length / this.itemsPerPage) || 1;

            if (direction === 'prev' && this.currentPage > 1) {
                this.currentPage--;
            } else if (direction === 'next' && this.currentPage < maxPages) {
                this.currentPage++;
            }
            this.loadPage();
        },

        changeItemsPerPage(newItemsPerPage) {
            this.itemsPerPage = parseInt(newItemsPerPage) || 20;
            this.currentPage = 1;
            this.loadPage();
        },

        loadPage() {
            const filtered = this.filteredAssets || [];
            this.totalPages = Math.ceil(filtered.length / this.itemsPerPage) || 1;

            if (this.currentPage > this.totalPages) {
                this.currentPage = this.totalPages;
            }
            if (this.currentPage < 1) {
                this.currentPage = 1;
            }

            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            this.assets = filtered.slice(start, end) || [];
        },

        initRouter() {
            if (typeof SimpleRouter !== 'undefined') {
                this.router = new SimpleRouter({
                    '': () => this.showHome(),
                    'asset/:id': (params) => this.showAsset(params.id)
                });
                this.router.listen();
            } else {
                console.warn('SimpleRouter not available, using fallback routing');
                this.currentRoute = 'home';
            }
        },

        showHome() {
            this.currentRoute = 'home';
            this.selectedAsset = null;
            this.directAssetLoaded = false;

            // If we only have one asset loaded (from direct access), load all assets
            if (this.allAssets.length <= 1) {
                this.loadAllAssets().catch(error => {
                    console.error('Failed to load all assets:', error);
                });
            }

            // Restore scroll position after DOM updates
            setTimeout(() => {
                window.scrollTo(0, this.scrollPosition);
            }, 100);
        },

        showAsset(assetId) {
            // If we already loaded this asset directly, don't process again
            if (this.directAssetLoaded && this.currentRoute === 'asset') {
                return;
            }
            
            this.currentRoute = 'asset';
            const asset = this.allAssets.find(a => a.primaryId === assetId);
            
            if (asset) {
                this.openAsset(asset);
                // Scroll to top when viewing asset
                window.scrollTo(0, 0);
            } else {
                this.router.navigate('');
            }
        },

        navigateToAsset(assetId) {
            // Remember current scroll position
            this.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

            if (this.router) {
                this.router.navigate(`asset/${assetId}`);
            } else {
                this.showAsset(assetId);
            }
        },

        navigateHome() {
            if (this.router) {
                this.router.navigate('');
            } else {
                this.showHome();
            }
        },

        openAsset(asset) {
            this.selectedAsset = { ...asset };

            if (!this.selectedAsset.releaseInfo || !this.selectedAsset.releaseInfo.length) {
                this.selectedAsset.releaseInfo = [{
                    appId: asset.appId,
                    platform: asset.platforms?.map(p => p.value || p).join(', ') || 'Windows',
                    dateAdded: new Date().toISOString()
                }];
            }

            this.selectedAsset.releaseInfo.forEach(rel => {
                if (!rel.appId) rel.appId = asset.appId;
                rel.download = rel.download || {};
            });
        }

    };
}

const formatUUID = function (uuid) {
    if (!uuid || uuid.length !== 32) return uuid;
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

const getPlatformIconClass = function (platformKey) {
    const key = (platformKey || '').toLowerCase();
    switch (key) {
        case 'windows':
        case 'win32':
            return 'fa fa-windows';
        case 'linux':
            return 'fa fa-linux';
        case 'android':
            return 'fa fa-android';
        case 'ios':
            return 'fa fa-mobile';
        case 'apple':
            return 'fa fa-apple';
        case 'laptop':
            return 'fa fa-laptop';
        case 'html5':
            return 'fa fa-html5';
        default:
            return 'fa fa-gamepad';
    }
}

const formatCompatibleApps = function (compatibleApps) {
    if (!Array.isArray(compatibleApps) || !compatibleApps.length) return '';

    // Convert the version strings into numbers and sort
    let sortedApps = compatibleApps.sort((a, b) => parseFloat(a) - parseFloat(b));

    // Initialize the chunks and the first chunk
    let chunks = [],
        chunk = [sortedApps[0]];

    // Iterate over the sorted version numbers, starting from the second one
    for (let i = 1; i < sortedApps.length; i++) {
        // Split each version string into major and minor parts
        let [prevMajor, prevMinor] = sortedApps[i - 1].split('.').map(Number);
        let [major, minor] = sortedApps[i].split('.').map(Number);

        // If the current version is the next one in sequence to the previous version (and they are of the same major version),
        // add it to the current chunk
        if (major === prevMajor && minor === prevMinor + 1) {
            chunk.push(sortedApps[i]);
        } else { // Otherwise, push the current chunk into the list of chunks and start a new chunk
            chunks.push(chunk);
            chunk = [sortedApps[i]];
        }
    }

    // Don't forget to push the last chunk into the list of chunks
    chunks.push(chunk);

    // Map each chunk to a string, joining the first and last versions with a dash if the chunk has more than one version
    // Join the chunk strings with commas and return the result
    return chunks.map(chunk => chunk.length === 1 ? chunk[0] : `${chunk[0]}-${chunk[chunk.length - 1]}`).join(', ');
}

const formatEngineVersions = function (engineVersions) {
    if (!engineVersions || engineVersions === 'Unknown') return engineVersions;

    // If it's already a string with commas, split it into an array
    let versions = typeof engineVersions === 'string' ? engineVersions.split(', ') : engineVersions;

    if (!Array.isArray(versions) || !versions.length) return engineVersions;

    // Use the same logic as formatCompatibleApps
    return formatCompatibleApps(versions);
}



const requestDownloadStatus = function (rel) {
    fetch(`/data/status/${rel.appId}.json`)
        .then(response => response.json())
        .then(json => {
            rel.download.status = json.status;
            rel.download.progress = json.progress;

            if (json.status === "complete" || json.status === "error") {
                clearInterval(rel.download.intervalId);
            }
        })
        .catch(error => console.error('Status check failed:', error));
}

const requestDownloadInfo = function (rel) {
    fetch(`/api/request/${rel.appId}`)
        .then(response => response.json())
        .then(json => {
            rel.download.status = json.status;
            rel.download.progress = json.progress || 0;

            if (json.status === "ok" || (json.status !== "complete" && json.status !== "error")) {
                rel.download.intervalId = setInterval(() => requestDownloadStatus(rel), 1000);
            }
        })
        .catch(error => {
            console.error('Download request failed:', error);
            rel.download.status = "error";
        });
}

const requestDownloadLink = function (appId) {
    fetch(`/api/download/${appId}`)
        .then(response => response.json())
        .then(json => {
            if (json.status === "complete" && json.url) {
                window.location.href = json.url;
            }
        })
        .catch(error => console.error('Download link failed:', error));
}

const dateOptions = {
    weekday: "short",
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
}

