---
name: nimet-weather-reporter
version: 1.0.0
description: Generates automated weather reports, agricultural guides, and extreme hazard alert briefs using local weather station database metrics.
triggers:
  - weather report
  - weather bulletin
  - generate bulletin
  - weather alert
  - nimet report
  - farming advisory
---

# NiMet Weather Reporter

Use this skill when the user asks for a weather summary, narrative bulletin, agricultural advisory, or severe weather alerts from the database.

## Instructions

1. **Parameters**:
   - Determine if the user asked for a specific station (e.g., Kaduna, Abuja) and the timeframe in days (default to 1 day if not specified).
   - If a specific station name is provided, first run `node .openclaw/skills/weather-reporter/scripts/fetch_metrics.js --list-stations` to match the station name with a valid `Station ID`.

2. **Fetching Data**:
   - Run the fetch command in the terminal:
     - For general summary of all stations:
       `node .openclaw/skills/weather-reporter/scripts/fetch_metrics.js --days <days>`
     - For a specific station:
       `node .openclaw/skills/weather-reporter/scripts/fetch_metrics.js --station <station_id> --days <days>`

3. **Synthesize & Draft Reports**:
   - **Daily Digest/Bulletin**: Focus on averages and ranges for air temperature, relative humidity, total precipitation, and maximum wind speed.
   - **Agricultural Advisory**: Analyze soil temperature and soil moisture (volumetric water content). Note: A soil moisture reading (VWC) below 10% (0.10) is dry, 15%-30% is moderate, and above 35% is wet/logged. Give recommendations on irrigation and planting based on these readings.
   - **Extreme Alert**: Call out severe anomalies like wind gusts > 10m/s, heavy rainfall > 20mm/day, or low sensor battery voltage (< 3.5V).

## Rules

- **Strict Citations**: Always cite the exact station names, IDs, dates, and metrics returned by the script. Do not invent weather observations.
- **Tone**: Maintain a professional, clear, and meteorological tone.
- **Safety**: Do not edit database entries. Only use the provided read-only CLI script to query.

## Examples

### Example 1: General Weather Summary
**User:** "Generate a weather bulletin for the last 3 days."
1. Run `node .openclaw/skills/weather-reporter/scripts/fetch_metrics.js --days 3`
2. Compile and output a structured bulletin highlighting hottest/wettest stations.

### Example 2: Station Farming Advisory
**User:** "How is Kaduna looking for farming today?"
1. Match "Kaduna" station ID by running the list.
2. Run `node .openclaw/skills/weather-reporter/scripts/fetch_metrics.js --station TA00692 --days 1`
3. Analyze soil moisture and draft an Agricultural Advisory.
