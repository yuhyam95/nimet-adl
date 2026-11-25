# Measurement unit validation

Validated on 23 November 2026 against configured provider metadata, stored
value ranges, ingestion mappings, and manufacturer documentation.

## API contract

`GET /weather/v1/parameters` exposes only parameters that can be returned in a
canonical unit. Provider-scale differences are normalized before output.
Unverified parameters are omitted and direct requests return
`PARAMETER_NOT_AVAILABLE`.

## Validated units

| Parameter | API unit | Evidence |
|---|---:|---|
| Air and sensor temperature | `degC` | TAHMO metadata, PulsoWeb context, ATMOS specification |
| Wind speed and gust | `m/s` | TAHMO metadata, PulsoWeb context, ATMOS specification |
| Wind direction and sensor tilt | `degree` | TAHMO metadata, PulsoWeb context, ATMOS specification |
| Precipitation | `mm` | TAHMO metadata, PulsoWeb hourly accumulation, ATMOS specification |
| Solar radiation | `W/m2` | TAHMO metadata; PulsoWeb J/m² hourly accumulation is divided by 3600 |
| Battery voltage | `V` | PulsoWeb context; TAHMO millivolts are divided by 1000 |
| Lightning count and distance | `count`, `km` | TAHMO metadata and ATMOS specification |
| Vapor pressure | `kPa` | ATMOS specification; stored CLIMDES range is consistent with kPa |

## Mixed or unverified fields

| Parameter | Status | Finding |
|---|---|---|
| Relative humidity | Normalized | Values on a 0–1 fractional scale are multiplied by 100; values already on a 0–100 scale are retained; invalid values become null. |
| Atmospheric pressure | Normalized | Values on a 50–120 kPa scale are multiplied by 10; values on a 500–1200 hPa scale are retained; invalid values become null. |
| Volumetric water content | Unverified | Stored CLIMDES values include negative and implausibly large values; no canonical unit can be asserted. |
| Soil electrical conductivity | Unverified | Stored values exist but the CLIMDES feed does not provide a unit contract. |
| Soil pH | Unverified | Current stored records are placeholders (zero) and are not a usable measurement contract. |
| ATMOS Gen 2 value | Unverified | The field name does not identify a physical quantity or unit. |

## Data-quality findings

- Some CLIMDES fields contain `-9999` sentinel values.
- TAHMO relative-humidity scale changes occur within historical station series.
- Pressure must be normalized per provider before it is used in a combined
  FarmCast calculation.
- FarmCast receives only canonical normalized values. Unverified inputs remain
  unavailable until their provider contracts are established.

## References

- [TAHMO API V2 official examples](https://github.com/TAHMO/API-V2-Python-examples)
  use the `/services/assets/v2/variables` endpoint for variable units. The
  configured endpoint was queried during this audit.
- [METER ATMOS 41 Gen 2 specifications](https://metergroup.com/products/atmos-41/)
  define pressure and vapor pressure in kPa, wind in m/s, lightning distance in
  km, tilt in degrees, and temperature in °C.
- PulsoWeb `get_context` metadata from the configured NiMet account was queried
  for mapped observation codes during this audit.
