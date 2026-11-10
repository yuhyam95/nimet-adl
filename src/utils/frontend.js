const fs = require('fs');
const path = require('path');
const express = require('express');

function mountFrontend(app, frontendDirectory) {
    const frontendIndex = path.join(frontendDirectory, 'index.html');

    // API requests must never fall through to the React application.
    app.use('/api', (req, res) => {
        res.status(404).json({ success: false, message: 'API endpoint not found.' });
    });

    app.use(express.static(frontendDirectory, {
        index: false,
        fallthrough: true,
        redirect: false
    }));

    // Middleware avoids Express 5 wildcard route syntax differences. Only HTML
    // navigation requests without a file extension receive the SPA entry point.
    app.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) return next();
        if (path.extname(req.path)) return next();
        if (!req.accepts('html')) return next();
        if (!fs.existsSync(frontendIndex)) {
            return res.status(503).type('text/plain').send('Frontend build is unavailable.');
        }
        return res.sendFile(frontendIndex);
    });

    app.use((req, res) => {
        res.status(404).type('text/plain').send('Not Found');
    });
}

module.exports = { mountFrontend };
