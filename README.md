# NI Crime Map

A high-performance, 100% client-side web application designed to ingest, visualize, and analyze over 3+ years of official Police Service of Northern Ireland street-level crime data (~150,000+ records). Built without external database servers, it utilizes advanced browser caching and GPU rendering to process massive spatial datasets in real time.

## Live Demo
**Try the interactive dashboard here:** [[NI Crime Map Demo](https://ethanmcanerney.github.io/NICrimeMap/)]


## Key Features & Performance Optimizations

* **GPU-Accelerated Rendering (HTML5 Canvas):** Bypasses standard DOM/SVG overhead by drawing up to 150,000 spatial points directly to the browser's GPU, preventing UI lag and screen freezes.
* **Dual-Stage Asynchronous Chunking:** Uses custom thread-yielding algorithms (setTimeout / micro-batching) to build geometry and spatial cluster trees without starving the browser's main UI thread.
* **IndexedDB Offline Caching:** Automatically saves compiled master datasets to the user's local disk cache. Subsequent visits load the entire 3-year archive instantly (< 1 second) without re-fetching CSVs.
* **Deterministic Spatial Jitter:** In comparison mode, secondary dataset coordinates are shifted by roughly 35 meters using mathematical pseudo-randomness, allowing overlapping historical trends to be viewed side-by-side on identical streets.


## Technology Stack
* **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Mapping Engine:** Leaflet.js (Canvas mode enabled) + OpenStreetMap
* **Clustering & Heatmaps:** Leaflet.markercluster, Leaflet.heat
* **Data Ingestion:** PapaParse (CSV streaming), Web Workers (Background threading)
* **Storage:** Native Browser IndexedDB

---

## Data Source & Attribution
Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
* **Source:** Official PSNI Street Crime datasets downloaded via [data.police.uk](https://data.police.uk/).
* **Privacy:** All incident coordinates are anonymized and snapped to the nearest public street or landmark by the reporting police force.
