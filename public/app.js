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

        async init() {

            const response = await fetch(`/data/vault.json?t=${Date.now()}`);
            const vaultAssets = await response.json();

            // Group by unique identifier (catalogItemId or listingIdentifier)
            const uniqueKeys = new Set();
            const uniqueAssets = [];

            vaultAssets.forEach(asset => {
                const key = asset.catalogItemId || asset.listingIdentifier;
                if (key && !uniqueKeys.has(key)) {
                    uniqueKeys.add(key);
                    uniqueAssets.push(asset);
                }
            });

            this.allAssets = uniqueAssets.map(vaultAsset => {
                const primaryId = vaultAsset.catalogItemId || vaultAsset.listingIdentifier;
                const listingId = vaultAsset.listingIdentifier || vaultAsset.catalogItemId;
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
                    compatibleApps: [],
                    keyImages: [],
                    releaseInfo: [],
                    url: `https://www.fab.com/listings/${formatUUID(listingId)}`
                };
            });


            await this.loadAssetDetails();
            this.buildFilters();
            this.loadPage();
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
                asset.compatibleApps = data.compatibleApps || [];

                asset.thumbnail = data.keyImages?.find(img => img.type === 'Thumbnail')?.url ||
                    data.keyImages?.find(img => img.type === 'Featured')?.url ||
                    data.keyImages?.find(img => img.type === 'Screenshot')?.url || '';

                asset.platforms = (data.platforms || []).map(p =>
                    typeof p === 'string' ? { key: p.toLowerCase(), value: p } : p
                );

                asset.releaseInfo = data.releaseInfo?.length ? data.releaseInfo : [{
                    appId: asset.appId,
                    platform: asset.platforms.map(p => p.value || p).join(', ') || 'Windows',
                    dateAdded: new Date().toISOString()
                }];

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

        openModal(asset) {
            this.selectedAsset = { ...asset };

            if (!this.selectedAsset.releaseInfo.length && asset.appId) {
                this.selectedAsset.releaseInfo = [{
                    appId: asset.appId,
                    platform: asset.platforms.map(p => p.value || p).join(', ') || 'Unknown',
                    dateAdded: new Date().toISOString()
                }];
            }

            this.selectedAsset.releaseInfo.forEach(rel => {
                if (!rel.appId) rel.appId = asset.appId;
                rel.download = {};
            });

            updateSlideshow(this.selectedAsset);
            
            if (typeof UIkit !== 'undefined' && UIkit.modal) {
                UIkit.modal('#modal-full').show();
            }
        },

        closeModal() {
            if (this.selectedAsset?.releaseInfo) {
                this.selectedAsset.releaseInfo.forEach(rel => {
                    if (rel.download?.intervalId) {
                        clearInterval(rel.download.intervalId);
                    }
                });
            }
            this.selectedAsset = null;
        },

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

const updateSlideshow = function (selectedAsset) {
    const slideshowContainer = document.querySelector('.uk-slideshow-items');
    if (!slideshowContainer) return;
    
    slideshowContainer.innerHTML = '';

    const screenshots = selectedAsset.keyImages?.filter(img => img.type === 'Screenshot' && img.url) || [];

    screenshots.forEach(image => {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = selectedAsset.title || '';
        img.setAttribute('uk-cover', '');
        li.appendChild(img);
        slideshowContainer.appendChild(li);
    });

    if (screenshots.length > 0 && slideshowContainer.parentElement) {
        UIkit.slideshow(slideshowContainer.parentElement, {
            animation: 'slide',
            autoplay: true
        });
    }
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

