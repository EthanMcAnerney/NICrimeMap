// --- 1. GLOBAL STATE & SAFE FORMATTING ---
let masterCrimeTable = [];
let availableMonths = [];
let currentRenderId = 0;

// Layer Caching
let cachedFilterKey = "";
let isStandardLayerBuilt = false;

// Safe Helper: Converts 152430 -> "152k" so text fits perfectly inside sleek circles!
function formatClusterCount(count) {
    if (count >= 10000) {
        return Math.round(count / 1000) + 'k';
    }
    return count.toLocaleString();
}

// --- 2. MAP INITIALIZATION & CLUSTER SETUP ---
const map = L.map('map', { preferCanvas: true }).setView([54.60, -6.60], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
}).addTo(map);

const clusterOptions = {
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 15,
    animateAddingMarkers: false,
    removeOutsideVisibleBounds: true
};

// CRITICAL FIX: Removed custom Red override! 
// This restores standard Leaflet styling (Green/Yellow/Orange/Red based on incident density)
const standardClusterLayer = L.markerClusterGroup({
    ...clusterOptions,
    iconCreateFunction: c => {
        const count = c.getChildCount();
        let sizeClass = 'marker-cluster-small';
        if (count > 100) sizeClass = 'marker-cluster-medium';
        if (count > 1000) sizeClass = 'marker-cluster-large';

        return L.divIcon({ 
            html: `<div><span>${formatClusterCount(count)}</span></div>`, 
            className: `marker-cluster ${sizeClass}`, 
            iconSize: [40, 40] 
        });
    }
});

let heatLayer = null;

const clusterGroupRed = L.markerClusterGroup({
    ...clusterOptions,
    iconCreateFunction: c => L.divIcon({ 
        html: `<div>${formatClusterCount(c.getChildCount())}</div>`, 
        className: 'custom-cluster-red', 
        iconSize: [40, 40] 
    })
});

const clusterGroupBlue = L.markerClusterGroup({
    ...clusterOptions,
    iconCreateFunction: c => L.divIcon({ 
        html: `<div>${formatClusterCount(c.getChildCount())}</div>`, 
        className: 'custom-cluster-blue', 
        iconSize: [40, 40] 
    })
});

// --- 3. DOM ELEMENTS ---
const statusText = document.getElementById('status-text');
const totalDbCount = document.getElementById('total-db-count');
const dataRangeText = document.getElementById('data-range-text');
const plottedRecordsCount = document.getElementById('plotted-records-count');
const viewModeSelect = document.getElementById('view-mode-select');
const fileInput = document.getElementById('csv-file-input');

// Controls
const categorySelect = document.getElementById('category-filter');
const startMonthSelect = document.getElementById('start-date-select');
const endMonthSelect = document.getElementById('end-date-select');
const compACat = document.getElementById('comp-a-category');
const compAStart = document.getElementById('comp-a-start');
const compAEnd = document.getElementById('comp-a-end');
const compBCat = document.getElementById('comp-b-category');
const compBStart = document.getElementById('comp-b-start');
const compBEnd = document.getElementById('comp-b-end');
const runCompareBtn = document.getElementById('run-compare-btn');

// --- 4. THREAD YIELDING & LOCAL DATABASE CACHE ---
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 15));

const DB_NAME = 'PSNI_Crime_Cache';
const DB_VERSION = 1;
const STORE_NAME = 'archive_data';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCachedArchive() {
    try {
        const db = await openDB();
        return new Promise(resolve => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get('master_table');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function saveToCache(data) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, 'master_table');
    } catch (e) { console.warn("Cache write failed:", e); }
}

// --- 5. STARTUP LOGIC ---
window.addEventListener('DOMContentLoaded', async () => {
    const cachedData = await getCachedArchive();
    
    if (cachedData && cachedData.length > 0) {
        masterCrimeTable = cachedData;
        document.getElementById('loader-container').style.display = 'none';
        statusText.textContent = "Loaded from Local Disk Cache";
        statusText.className = "success";
        initializeDashboard(true); // True = default to latest month on startup
    } else {
        const worker = new Worker('worker.js');
        worker.postMessage({ command: 'startLoading' });

        worker.onmessage = async function(e) {
            const msg = e.data;
            if (msg.type === 'progress') {
                document.getElementById('progress-fill').style.width = `${msg.percent}%`;
                document.getElementById('loader-text').textContent = msg.text;
            } else if (msg.type === 'complete') {
                masterCrimeTable = msg.data;
                document.getElementById('loader-text').textContent = "Saving archive to local disk...";
                await saveToCache(masterCrimeTable);
                
                document.getElementById('loader-container').style.display = 'none';
                statusText.textContent = "Live Archive Active";
                statusText.className = "success";
                initializeDashboard(true);
            }
        };
    }
});

// --- 6. INITIALIZE DROPDOWNS ---
function initializeDashboard(defaultToLatestMonth = false) {
    totalDbCount.textContent = masterCrimeTable.length.toLocaleString();

    const monthsSet = new Set(masterCrimeTable.map(row => row[2]));
    availableMonths = Array.from(monthsSet).sort();

    if (availableMonths.length > 0) {
        const oldest = availableMonths[0];
        const newest = availableMonths[availableMonths.length - 1];
        dataRangeText.textContent = `${oldest} — ${newest}`;

        [startMonthSelect, endMonthSelect, compAStart, compAEnd, compBStart, compBEnd].forEach(select => {
            select.innerHTML = '';
            availableMonths.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
        });

        startMonthSelect.value = defaultToLatestMonth ? newest : oldest;
        endMonthSelect.value = newest;
        compAStart.value = oldest;
        compAEnd.value = availableMonths[11] || newest;
        compBStart.value = availableMonths[availableMonths.length - 12] || oldest;
        compBEnd.value = newest;
    }

    const categoriesSet = new Set(masterCrimeTable.map(row => row[3]));
    [categorySelect, compACat, compBCat].forEach(select => {
        select.innerHTML = '<option value="all">All Categories</option>';
        Array.from(categoriesSet).sort().forEach(cat => {
            if (cat) {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                select.appendChild(opt);
            }
        });
    });

    document.getElementById('filter-section').classList.remove('hidden');
    triggerRender();
}

function getJitteredCoord(lat, lng, amount = 0.00035) {
    const jitterLat = lat + ((Math.sin(lat * 100000) - 0.5) * amount);
    const jitterLng = lng + ((Math.cos(lng * 100000) - 0.5) * amount);
    return [jitterLat, jitterLng];
}

// --- 7. DUAL-STAGE ASYNC PLOTTING ENGINE ---
async function buildAndClusterAsync(dataArray, targetClusterGroup, isComparison = false, colorHex = "#ff4757", applyJitter = false, renderId, progressStart = 0, progressEnd = 100) {
    const markers = [];
    const batchSize = 5000;
    const total = dataArray.length;
    const midPointProgress = progressStart + ((progressEnd - progressStart) / 2);

    // Stage 1: Build Canvas CircleMarkers
   for (let i = 0; i < total; i += batchSize) {
        if (renderId !== currentRenderId) return false;

        const limit = Math.min(i + batchSize, total);
        for (let j = i; j < limit; j++) {
            const r = dataArray[j];
            let coords = [r[0], r[1]];
            if (applyJitter) coords = getJitteredCoord(r[0], r[1]);

            let m;
            if (isComparison) {
                // Comparison Mode: Distinct solid colored dots
                m = L.circleMarker(coords, {
                    radius: 6,
                    fillColor: colorHex,
                    color: "#ffffff",
                    weight: 1.5,
                    opacity: 1.0,
                    fillOpacity: 0.9
                });
            } else {
                // STANDARD MODE: Restores the big, classic Leaflet teardrop pin!
                m = L.marker(coords);
            }

            m.bindPopup(`<b>${isComparison ? (applyJitter ? '[Range B] ' : '[Range A] ') : ''}${r[3]}</b><br>${r[4]}<br>Date: ${r[2]}`);
            markers.push(m);
        }

        const currentPct = progressStart + Math.round((limit / total) * (midPointProgress - progressStart));
        document.getElementById('progress-fill').style.width = `${currentPct}%`;
        document.getElementById('loader-text').textContent = `Building geometry: ${limit.toLocaleString()} / ${total.toLocaleString()}`;
        await yieldToMain();
    }

    // Stage 2: Feed markers into Leaflet Cluster Group in chunks
    for (let i = 0; i < markers.length; i += batchSize) {
        if (renderId !== currentRenderId) return false;

        const slice = markers.slice(i, i + batchSize);
        targetClusterGroup.addLayers(slice);

        const currentPct = midPointProgress + Math.round(((i + slice.length) / markers.length) * (progressEnd - midPointProgress));
        document.getElementById('progress-fill').style.width = `${currentPct}%`;
        document.getElementById('loader-text').textContent = `Clustering on map: ${(i + slice.length).toLocaleString()} / ${markers.length.toLocaleString()}`;
        await yieldToMain();
    }

    return true;
}

// --- 8. MASTER RENDER ENGINE ---
async function triggerRender() {
    currentRenderId++;
    const thisRenderId = currentRenderId;

    const mode = viewModeSelect.value;
    const start = startMonthSelect.value;
    const end = endMonthSelect.value;
    const cat = categorySelect.value;

    const currentFilterKey = `${start}-${end}-${cat}`;
    const canUseCache = (currentFilterKey === cachedFilterKey);

    // Clear active layers
    map.removeLayer(standardClusterLayer);
    if (heatLayer) map.removeLayer(heatLayer);
    map.removeLayer(clusterGroupRed);
    map.removeLayer(clusterGroupBlue);

    // INSTANT CACHE SWITCHING (0 seconds to swap back from heatmap!)
    if (canUseCache && mode === 'cluster' && isStandardLayerBuilt) {
        map.addLayer(standardClusterLayer);
        // Ensure UI counter updates when restoring layer from cache!
        plottedRecordsCount.textContent = standardClusterLayer.getLayers().length.toLocaleString();
        return;
    }

    const loader = document.getElementById('loader-container');
    const progressFill = document.getElementById('progress-fill');

    loader.style.display = 'block';
    progressFill.style.width = '0%';
    await yieldToMain();

    if (thisRenderId !== currentRenderId) return;

    if (mode === 'cluster' || mode === 'heat') {
        const filtered = masterCrimeTable.filter(r => r[2] >= start && r[2] <= end && (cat === 'all' || r[3] === cat));
        plottedRecordsCount.textContent = filtered.length.toLocaleString();

        if (mode === 'cluster') {
            standardClusterLayer.clearLayers();
            isStandardLayerBuilt = false;

            const success = await buildAndClusterAsync(filtered, standardClusterLayer, false, "#3498db", false, thisRenderId, 0, 100);
            if (!success || thisRenderId !== currentRenderId) return;

            map.addLayer(standardClusterLayer);
            cachedFilterKey = currentFilterKey;
            isStandardLayerBuilt = true;
            finishRender();
        } 
        else if (mode === 'heat') {
            const heatData = filtered.map(r => [r[0], r[1], 0.1]);
            heatLayer = L.heatLayer(heatData, {
                radius: 19, blur: 15, maxZoom: 14,
                gradient: { 0.3: 'lime', 0.6: 'yellow', 1.0: 'red' }
            });
            map.addLayer(heatLayer);
            finishRender();
        }
    } 
    else if (mode === 'compare') {
        clusterGroupRed.clearLayers();
        clusterGroupBlue.clearLayers();

        const aStart = compAStart.value;
        const aEnd = compAEnd.value;
        const aCat = compACat.value;
        const bStart = compBStart.value;
        const bEnd = compBEnd.value;
        const bCat = compBCat.value;

        const dataA = masterCrimeTable.filter(r => r[2] >= aStart && r[2] <= aEnd && (aCat === 'all' || r[3] === aCat));
        const dataB = masterCrimeTable.filter(r => r[2] >= bStart && r[2] <= bEnd && (bCat === 'all' || r[3] === bCat));

        // CRITICAL FIX: Update Overall Combined Total AND Individual Range Totals!
        plottedRecordsCount.textContent = (dataA.length + dataB.length).toLocaleString();
        document.getElementById('count-range-a').textContent = dataA.length.toLocaleString();
        document.getElementById('count-range-b').textContent = dataB.length.toLocaleString();

        const successA = await buildAndClusterAsync(dataA, clusterGroupRed, true, "#ff4757", false, thisRenderId, 0, 50);
        if (!successA || thisRenderId !== currentRenderId) return;

        const successB = await buildAndClusterAsync(dataB, clusterGroupBlue, true, "#1e90ff", true, thisRenderId, 50, 100);
        if (!successB || thisRenderId !== currentRenderId) return;

        map.addLayer(clusterGroupRed);
        map.addLayer(clusterGroupBlue);
        finishRender();
    }

    function finishRender() {
        if (thisRenderId === currentRenderId) {
            loader.style.display = 'none';
        }
    }
}

// --- 9. MANUAL FILE UPLOAD ---
fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    statusText.textContent = "Parsing new upload...";
    statusText.className = "warning";

    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async function(results) {
            let added = 0;
            const existingIDs = new Set(masterCrimeTable.map(r => `${r[2]}-${r[0]}-${r[1]}-${r[3]}`));

            results.data.forEach(d => {
                if (d.Latitude && d.Longitude && d.Month) {
                    const lat = parseFloat(d.Latitude);
                    const lng = parseFloat(d.Longitude);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        const id = `${d.Month}-${lat}-${lng}-${d['Crime type']}`;
                        if (!existingIDs.has(id)) {
                            existingIDs.add(id);
                            masterCrimeTable.push([lat, lng, d.Month, d['Crime type'] || 'Other', d.Location || 'N/A']);
                            added++;
                        }
                    }
                }
            });

            await saveToCache(masterCrimeTable);
            statusText.textContent = `Added ${added} new records!`;
            statusText.className = "success";
            cachedFilterKey = "";
            initializeDashboard(false);
        }
    });
});

// --- 10. EVENT LISTENERS ---
viewModeSelect.addEventListener('change', e => {
    const mode = e.target.value;
    const breakdownBox = document.getElementById('compare-count-breakdown');

    if (mode === 'compare') {
        document.getElementById('standard-controls').classList.add('hidden');
        document.getElementById('compare-controls').classList.remove('hidden');
        breakdownBox.classList.remove('hidden'); // Reveal Range A & Range B counters
        
        // Clear active layers, abort renders, and immediately zero out all UI counters!
        currentRenderId++;
        map.removeLayer(standardClusterLayer);
        if (heatLayer) map.removeLayer(heatLayer);
        map.removeLayer(clusterGroupRed);
        map.removeLayer(clusterGroupBlue);
        
        document.getElementById('loader-container').style.display = 'none';
        plottedRecordsCount.textContent = "0"; 
        document.getElementById('count-range-a').textContent = "0";
        document.getElementById('count-range-b').textContent = "0";
    } else {
        document.getElementById('standard-controls').classList.remove('hidden');
        document.getElementById('compare-controls').classList.add('hidden');
        breakdownBox.classList.add('hidden'); // Hide breakdown in Standard/Heatmap modes
        triggerRender();
    }
});

// Auto-render ONLY for Standard / Heatmap views
[categorySelect, startMonthSelect, endMonthSelect].forEach(el => {
    el.addEventListener('change', () => {
        cachedFilterKey = "";
        triggerRender();
    });
});

// Comparison Mode: ONLY render when the confirm button is clicked
runCompareBtn.addEventListener('click', () => {
    triggerRender();
});