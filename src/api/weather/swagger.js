const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');

const OPENAPI_PATH = path.join(__dirname, '../../../docs/openapi.yaml');

function loadOpenApiDocument() {
    return YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
}

function createWeatherDocsRouter() {
    const router = express.Router();
    const document = loadOpenApiDocument();

    router.get('/openapi.yaml', (req, res) => {
        res.type('application/yaml').sendFile(OPENAPI_PATH);
    });

    router.use(
        '/docs',
        swaggerUi.serve,
        swaggerUi.setup(document, {
            customSiteTitle: 'NiMet Weather API Documentation',
            swaggerOptions: {
                displayRequestDuration: true,
                persistAuthorization: true
            }
        })
    );

    return router;
}

module.exports = {
    OPENAPI_PATH,
    createWeatherDocsRouter,
    loadOpenApiDocument
};
