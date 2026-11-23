const express = require('express');
const { createWeatherService } = require('./service.js');
const { getParameterDefinition, listParameters } = require('./parameters.js');
const {
    RequestValidationError,
    parseNearestStationQuery,
    parseObservationSummaryQuery,
    parseParameterObservationsQuery,
    parseStationsQuery,
    requiredStationId
} = require('./validation.js');

function sendError(res, status, code, message, details) {
    const error = { code, message };
    if (details && Object.keys(details).length > 0) error.details = details;
    return res.status(status).json({ success: false, error });
}

function createWeatherRouter({ db, authorize }) {
    const router = express.Router();
    const service = createWeatherService(db);

    router.get('/health', (req, res) => {
        res.json({
            success: true,
            data: {
                service: 'NiMet Weather API',
                version: 'v1',
                status: 'online',
                timestamp: new Date().toISOString()
            }
        });
    });

    router.get('/parameters', authorize, (req, res) => {
        const parameters = listParameters();
        res.json({
            success: true,
            data: parameters,
            meta: { count: parameters.length }
        });
    });

    router.get('/stations', authorize, async (req, res) => {
        try {
            const query = parseStationsQuery(req.query);
            const result = await service.listStations(query);
            return res.json({
                success: true,
                data: result.stations,
                meta: {
                    pagination: result.pagination,
                    filters: {
                        provider: query.provider,
                        state: query.state,
                        lga: query.lga,
                        search: query.search,
                        active: query.active
                    }
                }
            });
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return sendError(res, 400, error.code, error.message, error.details);
            }
            console.error('Weather API stations error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Unable to load stations.');
        }
    });

    router.get('/stations/nearest', authorize, async (req, res) => {
        try {
            const query = parseNearestStationQuery(req.query);
            const stations = await service.findNearestStations(query);
            res.json({
                success: true,
                data: stations,
                meta: {
                    count: stations.length,
                    query
                }
            });
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return sendError(res, 400, error.code, error.message, error.details);
            }
            console.error('Weather API nearest stations error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Unable to find nearby stations.');
        }
    });

    router.get('/observations/latest', authorize, async (req, res) => {
        try {
            const stationId = requiredStationId(req.query.stationId);
            const observation = await service.getLatestObservation(stationId);
            if (!observation) {
                return sendError(
                    res,
                    404,
                    'OBSERVATION_NOT_FOUND',
                    'No observation was found for the requested station.'
                );
            }
            return res.json({ success: true, data: observation });
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return sendError(res, 400, error.code, error.message, error.details);
            }
            console.error('Weather API latest observation error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Unable to load the latest observation.');
        }
    });

    router.get('/observations/summary', authorize, async (req, res) => {
        try {
            const query = parseObservationSummaryQuery(req.query);
            let station;
            if (query.stationId) {
                station = await service.getStationById(query.stationId);
            } else {
                const stations = await service.findNearestStations({
                    latitude: query.latitude,
                    longitude: query.longitude,
                    radiusKm: query.radiusKm,
                    limit: 1
                });
                station = stations[0] || null;
            }

            if (!station) {
                return sendError(
                    res,
                    404,
                    'STATION_NOT_FOUND',
                    'No eligible weather station was found for the request.'
                );
            }

            const summary = await service.getObservationSummary(
                station,
                query.start,
                query.endExclusive
            );
            return res.json({ success: true, data: summary });
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return sendError(res, 400, error.code, error.message, error.details);
            }
            console.error('Weather API observation summary error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Unable to summarize observations.');
        }
    });

    router.get('/parameters/:parameter/observations', authorize, async (req, res) => {
        try {
            const parameter = getParameterDefinition(req.params.parameter);
            if (!parameter) {
                return sendError(
                    res,
                    400,
                    'UNSUPPORTED_PARAMETER',
                    'The requested weather parameter is not supported.',
                    { supportedParameters: listParameters().map(item => item.name) }
                );
            }
            if (!parameter.exposed) {
                return sendError(
                    res,
                    422,
                    'PARAMETER_NOT_AVAILABLE',
                    'This parameter is not available through the normalized weather API.'
                );
            }

            const query = parseParameterObservationsQuery(req.query);
            let station;
            if (query.stationId) {
                station = await service.getStationById(query.stationId);
            } else {
                const stations = await service.findNearestStations({
                    latitude: query.latitude,
                    longitude: query.longitude,
                    radiusKm: query.radiusKm,
                    limit: 1
                });
                station = stations[0] || null;
            }

            if (!station) {
                return sendError(
                    res,
                    404,
                    'STATION_NOT_FOUND',
                    'No eligible weather station was found for the request.'
                );
            }

            const result = await service.getParameterObservations({
                station,
                parameter,
                start: query.start,
                endExclusive: query.endExclusive,
                order: query.order,
                limit: query.limit,
                offset: query.offset
            });
            return res.json({ success: true, data: result });
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return sendError(res, 400, error.code, error.message, error.details);
            }
            console.error('Weather API parameter observations error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Unable to load parameter observations.');
        }
    });

    return router;
}

module.exports = { createWeatherRouter };
