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

        async init() {
            const response = await fetch(`/vault.json?timestamp=${new Date().getTime()}`);
            let assets = await response.json();

            // Remove duplicates based on catalogItemId
            this.allUniqueAssets = Array.from(new Set(assets.map(a => a.catalogItemId)))
                .map(catalogItemId => {
                    let asset = assets.find(a => a.catalogItemId === catalogItemId);
                    asset.loaded = false; // Add a loaded property for each asset
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
                const batchPromises = batch.map(asset => {
                    if (!asset.loaded) {
                        return fetch(`/detail/${asset.catalogItemId}.json`)
                            .then(async response => {
                                const details = await response.json();
                                // Populate asset details
                                asset.catalogItemId = details.data.data.catalogItemId;
                                asset.thumbnail = details.data.data.thumbnail;
                                asset.title = details.data.data.title;
                                asset.author = details.data.data.seller.name;
                                asset.category = details.data.data.categories.map(c => c.name).join(', ');
                                asset.platforms = details.data.data.platforms;
                                asset.compatibleApps = details.data.data.compatibleApps;
                                asset.url = `https://www.unrealengine.com/marketplace/en-US/item/${asset.catalogItemId}`;
                                asset.seller = details.data.data.seller;
                                asset.description = details.data.data.description;
                                asset.technicalDetails = details.data.data.technicalDetails;
                                asset.longDescription = details.data.data.longDescription;
                                asset.keyImages = details.data.data.keyImages;
                                asset.releaseInfo = details.data.data.releaseInfo;
                                asset.loaded = true; // Mark the asset as loaded
                                this.loadedCount++; // Increment the counter when an asset is loaded

                                // Also populate searchAssetData
                                this.searchAssetData[asset.catalogItemId] = details.data.data.title.toLowerCase() +
                                    details.data.data.categories.map(c => c.name).join(' ').toLowerCase() +
                                    details.data.data.seller.name.toLowerCase() +
                                    details.data.data.description.toLowerCase() +
                                    details.data.data.longDescription.toLowerCase() +
                                    details.data.data.technicalDetails.toLowerCase();
                            });
                    }
                });

                // Wait for all fetch promises in the batch to be settled
                await Promise.allSettled(batchPromises);
                // delay between batches
                if (i + batchSize < this.allUniqueAssets.length) { // Check to avoid unnecessary delay after the last batch
                    await sleep(delayBetweenBatches);
                }
            }

            this.assets = this.allUniqueAssets.filter(asset => asset.loaded);
            this.totalPages = Math.ceil(this.assets.length / this.itemsPerPage);
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
            if (!this.searchQuery) {
                return this.allUniqueAssets.map(asset => asset.catalogItemId);
            }

            const query = this.searchQuery.toLowerCase();
            return Object.keys(this.searchAssetData).filter(catalogItemId =>
                this.searchAssetData[catalogItemId].includes(query)
            );
        },

        async performSearch() {
            this.currentPage = 1; // Reset to the first page when performing a search
            this.totalPages = Math.ceil((this.filteredAssets.length || 0) / this.itemsPerPage);
            this.loadPage();
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
            updateSlideshow(this.selectedAsset);

            for (rel of this.selectedAsset.releaseInfo) {
                rel.download = {};
            }
            UIkit.modal('#modal-full').show();
        },

        closeModal() {
            for (rel of this.selectedAsset.releaseInfo) {
                try {
                    clearInterval(rel.download.intervalId);
                } catch (err) {
                    console.error(err);
                }
            }
            this.selectedAsset = null;
        },

    };

}

const getPlatformIconClass = function(platformKey) {
    switch (platformKey) {
        case 'windows':
            return 'fa fa-windows';
        case 'windows2':
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
        case 'eye':
            return 'fa fa-gamepad';
        case 'hololens2':
            return 'fa fa-gamepad';
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
      img.alt = "";  // Set an appropriate alt text
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
    fetch(`/status/${rel.appId}.json`)
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
