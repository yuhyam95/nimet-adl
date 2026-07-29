const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const crypto = require('crypto');

const csvPath = path.join(__dirname, 'NiMet stations metadata.csv');
const jsonOutputPath = path.join(__dirname, 'clean_stations.json');

const csvContent = fs.readFileSync(csvPath, 'utf8');

Papa.parse(csvContent, {
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    let data = results.data;
    
    const cleanData = data.map((row) => {
      // Create a clean object to drop all the blank trailing columns
      let cleanRow = {
        station_id: crypto.randomUUID(),
        station_name: row.station_name ? row.station_name.trim() : "",
        latitude: parseFloat(row.latitude) || null,
        longitude: parseFloat(row.longitude) || null,
        altitude: row.altitude ? parseFloat(row.altitude) : null,
        site_code: row.site_code ? row.site_code.replace(/\uFFFD/g, '').trim() : "",
        provider: row.provider ? row.provider.trim() : "WAGTECH",
        organization: row.organization ? row.organization.trim() : "NiMet",
        status: row.status ? row.status.trim() : "inactive",
        protocol: row.protocol ? row.protocol.trim() : "FTP",
        transmission_status: row.transmission_status ? row.transmission_status.trim() : "inactive"
      };

      // Fix specific known typos
      if (cleanRow.station_name.includes("Dikko College Katsina") && cleanRow.latitude === 73613) {
        cleanRow.latitude = 7.3613;
      }
      if (cleanRow.station_name.includes("Asaba International Airport") && cleanRow.longitude === 64.26) {
        cleanRow.longitude = 6.426;
      }

      return cleanRow;
    });

    const csvOutput = Papa.unparse(cleanData);
    const csvOutputPath = path.join(__dirname, 'clean_stations.csv');
    fs.writeFileSync(csvOutputPath, csvOutput, 'utf8');
    console.log(`Successfully cleaned ${cleanData.length} stations and wrote to clean_stations.csv`);
  }
});
