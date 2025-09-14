function vaultManager() {
    return {
        searchQuery: '',
        assets: [],
        allUniqueAssets: [],
        currentPage: 1,
        itemsPerPage: 20,
        totalPages: 0,
        selectedAsset: {},
        showDetails: false,
        currentPhoto: 0,
        searchAssetData: {},
        categoryFilter: '',
        listingTypeFilter: '',
        availableCategories: [],
        availableListingTypes: [],

        async init() {
    const response = await fetch(`/data/vault.json?timestamp=${new Date().getTime()}`);
    let assets = await response.json();

    // Remove duplicates based on catalogItemId and initialize with vault data
    this.allUniqueAssets = Array.from(new Set(assets.map(a => a.catalogItemId)))
        .map(catalogItemId => {
            let asset = assets.find(a => a.catalogItemId === catalogItemId);
            // Initialize with vault data
            asset.loaded = false;
            asset.thumbnail = asset.thumbnail || '';
            asset.category = asset.category || '';
            asset.author = asset.seller || '';
            asset.platforms = asset.platforms || [];
            asset.compatibleApps = asset.compatibleApps || [];
            asset.keyImages = asset.keyImages || [];
            asset.releaseInfo = asset.releaseInfo || [];
            // Use artifactId from vault data for downloads
            asset.appId = asset.artifactId || asset.appName;
            return asset;
        });

    this.totalPages = Math.ceil(this.allUniqueAssets.length / this.itemsPerPage);

    // Counter to track the number of loaded assets
    this.loadedCount = 0;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Create an array to hold all the fetch promises
    const batchSize = 10; // Adjust batch size as needed
    const delayBetweenBatches = 50; // Delay in milliseconds

    for (let i = 0; i < this.allUniqueAssets.length; i += batchSize) {
        const batch = this.allUniqueAssets.slice(i, i + batchSize);
        const batchPromises = batch.map((asset, index) => {
            if (!asset.loaded) {
                return fetch(`/data/detail/${asset.catalogItemId}.json`)
                    .then(async response => {
                        if (!response.ok) {
                            throw new Error(`Failed to fetch asset details for ${asset.catalogItemId}`);
                        }

                        const details = await response.json();
                        
                        // Handle nested data structure from detail files
                        const assetData = details.data?.data || details;
                        
                        // Enhance asset with detail data
                        asset.thumbnail = assetData.keyImages?.find(img => img.type === 'Thumbnail')?.url || 
                                        assetData.keyImages?.find(img => img.type === 'Featured')?.url || 
                                        asset.thumbnail;
                        asset.title = assetData.title || asset.title;
                        asset.author = assetData.seller?.name || asset.author;
                        
                        // Handle category structure
                        if (assetData.categories && assetData.categories.length > 0) {
                            asset.category = assetData.categories.map(c => c.name).join(', ');
                        }
                        
                        // Handle platforms - can be array of strings or objects
                        if (assetData.platforms) {
                            asset.platforms = assetData.platforms.map(p => 
                                typeof p === 'string' ? { key: p.toLowerCase(), value: p } : p
                            );
                        } else if (!asset.platforms) {
                            asset.platforms = [];
                        }
                        asset.compatibleApps = assetData.compatibleApps || asset.compatibleApps;
                        asset.url = asset.url || `https://www.fab.com/listings/${formatUUID(asset.catalogItemId)}`;
                        asset.seller = assetData.seller || asset.seller;
                        asset.description = assetData.description || asset.description;
                        asset.technicalDetails = assetData.technicalDetails;
                        asset.longDescription = assetData.longDescription;
                        asset.keyImages = assetData.keyImages || asset.keyImages;
                        asset.licenses = assetData.licenses || [];
                        asset.listingType = assetData.listingType || asset.listingType;
                        asset.assetFormats = assetData.assetFormats || [];
                        
                        // Create releaseInfo from detail data if available
                        if (assetData.releaseInfo && assetData.releaseInfo.length > 0) {
                            asset.releaseInfo = assetData.releaseInfo;
                        } else if (asset.appId) {
                            // Create releaseInfo using artifactId from vault data
                            asset.releaseInfo = [{
                                appId: asset.appId,
                                platform: asset.platforms?.map(p => p.value || p).join(', ') || 'Unknown',
                                dateAdded: new Date().toISOString()
                            }];
                        }
                        asset.loaded = true; // Mark the asset as loaded
                        this.loadedCount++; // Increment the counter when an asset is loaded

                        // Build search text from available data
                        const searchText = [
                            asset.title,
                            asset.category,
                            asset.author,
                            asset.description,
                            asset.longDescription,
                            asset.technicalDetails,
                            asset.listingType,
                            (asset.licenses?.map(l => l.name).join(' ') || '')
                        ].filter(Boolean).join(' ').toLowerCase();
                        
                        this.searchAssetData[asset.catalogItemId] = searchText;
                    })
                    .catch(error => {
                        console.error(`Error loading asset ${asset.catalogItemId}:`, error);
                        // Remove the asset from the allUniqueAssets array if there's an error
                        this.allUniqueAssets = this.allUniqueAssets.filter(a => a.catalogItemId !== asset.catalogItemId);
                    });
            }
        });

        // Wait for all fetch promises in the batch to be settled
        await Promise.allSettled(batchPromises);
        // Delay between batches
        if (i + batchSize < this.allUniqueAssets.length) { // Check to avoid unnecessary delay after the last batch
            await sleep(delayBetweenBatches);
        }
    }

    // Filter assets to only those that are loaded
    this.assets = this.allUniqueAssets.filter(asset => asset.loaded);
    this.totalPages = Math.ceil(this.assets.length / this.itemsPerPage);
    
    // Build filter options
    this.availableCategories = [...new Set(this.assets.map(asset => asset.category).filter(Boolean))].sort();
    this.availableListingTypes = [...new Set(this.assets.map(asset => asset.listingType).filter(Boolean))].sort();
    
    this.loadPage();
},



        displayAsset(asset) {
            if (this.assets.length < this.itemsPerPage) {
                if (!this.searchQuery || this.filteredAssets.includes(asset.catalogItemId)) {
                    this.assets.push(asset);
                }
            }
        },

        get filteredAssets() {
            let filtered = this.allUniqueAssets.filter(asset => asset.loaded);
            
            // Apply search query
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(asset => 
                    this.searchAssetData[asset.catalogItemId]?.includes(query)
                );
            }
            
            // Apply category filter
            if (this.categoryFilter) {
                filtered = filtered.filter(asset => asset.category === this.categoryFilter);
            }
            
            // Apply listing type filter
            if (this.listingTypeFilter) {
                filtered = filtered.filter(asset => asset.listingType === this.listingTypeFilter);
            }
            
            return filtered.map(asset => asset.catalogItemId);
        },

        async performSearch() {
            this.currentPage = 1;
            this.totalPages = Math.ceil((this.filteredAssets.length || 0) / this.itemsPerPage);
            this.loadPage();
        },
        
        clearFilters() {
            this.searchQuery = '';
            this.categoryFilter = '';
            this.listingTypeFilter = '';
            this.performSearch();
        },

        async changePage(direction) {
            if (direction === 'prev' && this.currentPage > 1) this.currentPage--;
            else if (direction === 'next' && this.currentPage < this.totalPages) this.currentPage++;

            this.loadPage();
        },

        async changeItemsPerPage(newItemsPerPage) {
            this.itemsPerPage = newItemsPerPage;
            const pendingAssets = this.allUniqueAssets.filter(asset => !asset.loaded);
            const loadedAssets = this.allUniqueAssets.filter(asset => asset.loaded);
            const displayedAssets = loadedAssets.slice(0, this.itemsPerPage);
            this.totalPages = Math.ceil((loadedAssets.length + pendingAssets.length) / this.itemsPerPage);
            this.currentPage = Math.min(this.currentPage, this.totalPages); // Adjust current page if necessary
            this.assets = displayedAssets;
        },

        loadPage() {
            let start = (this.currentPage - 1) * this.itemsPerPage;
            let end = this.currentPage * this.itemsPerPage;

            const filteredCatalogItemIds = this.filteredAssets.slice(start, end);
            this.assets = this.allUniqueAssets.filter(asset =>
                filteredCatalogItemIds.includes(asset.catalogItemId)
            );
        },

        openModal(asset) {
            this.selectedAsset = asset;
            this.selectedAsset.downloads = {};
            this.selectedAsset.releaseInfo = this.selectedAsset.releaseInfo || [];
            
            // If no releaseInfo exists, create one using the artifactId
            if (this.selectedAsset.releaseInfo.length === 0 && asset.appId) {
                this.selectedAsset.releaseInfo = [{
                    appId: asset.appId,
                    platform: asset.platforms?.map(p => p.value || p).join(', ') || 'Unknown',
                    dateAdded: new Date().toISOString()
                }];
            }
            
            // Ensure all releaseInfo entries have the correct appId
            for (let rel of this.selectedAsset.releaseInfo) {
                if (!rel.appId && asset.appId) {
                    rel.appId = asset.appId;
                }
            }
            
            updateSlideshow(this.selectedAsset);

            for (let rel of this.selectedAsset.releaseInfo) {
                rel.download = {};
            }
            UIkit.modal('#modal-full').show();
        },

        closeModal() {
            if (this.selectedAsset && this.selectedAsset.releaseInfo) {
                for (let rel of this.selectedAsset.releaseInfo) {
                    try {
                        clearInterval(rel.download.intervalId);
                    } catch (err) {
                        console.error(err);
                    }
                }
            }
            this.selectedAsset = null;
        },

    };

}

const formatUUID = function(uuid) {
    if (!uuid || uuid.length !== 32) return uuid;
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

const getPlatformIconClass = function(platformKey) {
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

const formatCompatibleApps = function(compatibleApps) {
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

const updateSlideshow = function(selectedAsset) {
    const slideshowContainer = document.querySelector('.uk-slideshow-items');
    slideshowContainer.innerHTML = ''; // Clear existing items

    if (selectedAsset && selectedAsset.keyImages) {
        selectedAsset.keyImages.filter(i => i.type === 'Screenshot' && i.url).forEach(image => {
            const li = document.createElement('li');
            const img = document.createElement('img');
            img.src = image.url;
            img.alt = ""; // Set an appropriate alt text
            img.setAttribute('uk-cover', '');
            li.appendChild(img);
            slideshowContainer.appendChild(li);
        });
    }

    UIkit.slideshow(slideshowContainer.parentElement, {
        animation: 'slide',
        autoplay: true
    });
}

const requestDownloadStatus = function(rel) {
    fetch(`/data/status/${rel.appId}.json`)
        .then(response => response.json())
        .then(json => {
            if (json.status === "complete" || json.status === "error") {
                rel.download.status = json.status;
                clearInterval(rel.download.intervalId);
            } else {
                rel.download.status = json.status;
                rel.download.progress = json.progress;
            }
        })
        .catch(error => {
            console.error(error);
        });
}

const requestDownloadInfo = function(rel) {
    fetch(`/api/request/${rel.appId}`)
        .then(response => response.json())
        .then(json => {
            if (json.status === "ok") {
                rel.download.intervalId = setInterval(() => requestDownloadStatus(rel), 1000);
            } else if (json.status === "complete") {
                rel.download.status = "complete";
            } else if (json.status === "error") {
                rel.download.status = "error";
                if (rel.download.intervalId) {
                    clearInterval(rel.download.intervalId);
                }
            } else {
                rel.download.status = json.status;
                rel.download.progress = json.progress;
                if (!rel.download.IntervalId) {
                    rel.download.intervalId = setInterval(() => requestDownloadStatus(rel), 1000);
                }
            }
        })
        .catch(error => console.error(error));
}

const requestDownloadLink = function(appId) {
    fetch(`/api/download/${appId}`)
        .then(response => response.json())
        .then(json => {
            if (json.status === "complete" && json.url) {
                window.location.href = json.url;
            }
        })
        .catch(error => console.error(error));
}

const dateOptions = {
    weekday: "short",
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
}
