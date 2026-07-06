importScripts('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js');

self.onmessage = async function(e) {
    if (e.data.command === 'startLoading') {
        const masterTable = [];
        const loadedIDs = new Set();
        
        let year = 2023;//may 2023 to april 2026
        let month = 5;
        const endYear = 2026;
        const endMonth = 4;

        const totalMonths = (endYear - year) * 12 + (endMonth - month) + 1;
        let monthsProcessed = 0;

        while (year < endYear || (year === endYear && month <= endMonth)) {
            const monthStr = month.toString().padStart(2, '0');
            const folderName = `${year}-${monthStr}`;
            const path = `data/${folderName}/${folderName}-northern-ireland-street.csv`;

            try {
                const response = await fetch(`../${path}`);
                if (response.ok) {
                    const csvText = await response.text();
                    
                    Papa.parse(csvText, {
                        header: true,
                        skipEmptyLines: true,
                        step: function(row) {
                            const d = row.data;
                            if (d.Latitude && d.Longitude && d.Month) {
                                const lat = parseFloat(d.Latitude);
                                const lng = parseFloat(d.Longitude);
                                
                                if (!isNaN(lat) && !isNaN(lng)) {
                                    const uniqueId = `${d.Month}-${lat}-${lng}-${d['Crime type']}`;
                                    if (!loadedIDs.has(uniqueId)) {
                                        loadedIDs.add(uniqueId);
                                        //reduce size
                                        masterTable.push([lat, lng, d.Month, d['Crime type'] || 'Other', d.Location || 'N/A']);
                                    }
                                }
                            }
                        }
                    });
                }
            } catch (err) {
                //skip missing
            }

            monthsProcessed++;
            
            //progress
            self.postMessage({
                type: 'progress',
                percent: Math.round((monthsProcessed / totalMonths) * 100),
                text: `Reading ${folderName}... (${masterTable.length.toLocaleString()} crimes found)`
            });

            month++;
            if (month > 12) { month = 1; year++; }
        }

        self.postMessage({ type: 'complete', data: masterTable });
    }
};