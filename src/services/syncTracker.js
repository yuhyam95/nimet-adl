const db = require('../db/index.js');

let schemaPromise;

class SyncAlreadyRunningError extends Error {
    constructor(provider, runId) {
        super(`${provider} already has an active synchronization${runId ? ` (run ${runId})` : ''}.`);
        this.name = 'SyncAlreadyRunningError';
        this.code = 'SYNC_ALREADY_RUNNING';
        this.runId = runId || null;
    }
}

async function ensureSyncTrackingSchema() {
    if (!schemaPromise) {
        schemaPromise = db.query(`
            CREATE TABLE IF NOT EXISTS sync_runs (
                id BIGSERIAL PRIMARY KEY,
                provider VARCHAR(50) NOT NULL,
                trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('manual', 'automatic')),
                status VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
                phase VARCHAR(50) NOT NULL DEFAULT 'queued',
                requested_by_id INTEGER,
                requested_by_username VARCHAR(255),
                requested_start TEXT NOT NULL,
                requested_end TEXT NOT NULL,
                total_stations INTEGER NOT NULL DEFAULT 0,
                processed_stations INTEGER NOT NULL DEFAULT 0,
                successful_stations INTEGER NOT NULL DEFAULT 0,
                failed_stations INTEGER NOT NULL DEFAULT 0,
                skipped_stations INTEGER NOT NULL DEFAULT 0,
                readings_processed INTEGER NOT NULL DEFAULT 0,
                current_station_id VARCHAR(255),
                current_chunk INTEGER,
                total_chunks INTEGER,
                error_message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sync_run_items (
                id BIGSERIAL PRIMARY KEY,
                run_id BIGINT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
                station_id VARCHAR(255) NOT NULL,
                station_name VARCHAR(255),
                status VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
                completed_chunks INTEGER NOT NULL DEFAULT 0,
                total_chunks INTEGER NOT NULL DEFAULT 0,
                readings_processed INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                UNIQUE (run_id, station_id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_one_active_provider_idx
                ON sync_runs (provider)
                WHERE status IN ('queued', 'running');
            CREATE INDEX IF NOT EXISTS sync_runs_created_at_idx
                ON sync_runs (created_at DESC);
            CREATE INDEX IF NOT EXISTS sync_run_items_run_id_idx
                ON sync_run_items (run_id, status);

            UPDATE sync_runs
            SET status = 'failed',
                phase = 'interrupted',
                error_message = COALESCE(error_message, 'Synchronization was interrupted by a backend restart.'),
                completed_at = NOW(),
                heartbeat_at = NOW()
            WHERE status IN ('queued', 'running');
        `).catch(error => {
            schemaPromise = null;
            throw error;
        });
    }
    await schemaPromise;
}

async function createSyncRun({ provider, triggerType, startDate, endDate, requestedBy }) {
    await ensureSyncTrackingSchema();
    try {
        const result = await db.query(
            `INSERT INTO sync_runs (
                provider, trigger_type, requested_by_id, requested_by_username,
                requested_start, requested_end
             ) VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                String(provider).toUpperCase(),
                triggerType,
                requestedBy?.id || null,
                requestedBy?.username || null,
                String(startDate),
                String(endDate)
            ]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code !== '23505') throw error;
        const active = await db.query(
            `SELECT id FROM sync_runs
             WHERE provider = $1 AND status IN ('queued', 'running')
             ORDER BY created_at DESC LIMIT 1`,
            [String(provider).toUpperCase()]
        );
        throw new SyncAlreadyRunningError(provider, active.rows[0]?.id);
    }
}

async function startRun(runId) {
    await db.query(
        `UPDATE sync_runs
         SET status = 'running', phase = 'fetching_stations',
             started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW()
         WHERE id = $1`,
        [runId]
    );
}

async function setRunStations(runId, totalStations) {
    await db.query(
        `UPDATE sync_runs
         SET total_stations = $2, phase = 'syncing_stations', heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, totalStations]
    );
}

async function startStation(runId, stationId, stationName) {
    await db.query(
        `INSERT INTO sync_run_items (
            run_id, station_id, station_name, status, started_at
         ) VALUES ($1, $2, $3, 'running', NOW())
         ON CONFLICT (run_id, station_id) DO UPDATE SET
            station_name = EXCLUDED.station_name,
            status = 'running',
            started_at = COALESCE(sync_run_items.started_at, NOW()),
            error_message = NULL`,
        [runId, stationId, stationName || null]
    );
    await db.query(
        `UPDATE sync_runs
         SET current_station_id = $2, current_chunk = NULL,
             total_chunks = NULL, heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, stationId]
    );
}

async function setStationChunks(runId, stationId, currentChunk, totalChunks, completedChunks = currentChunk) {
    await db.query(
        `UPDATE sync_run_items
         SET completed_chunks = $3, total_chunks = $4
         WHERE run_id = $1 AND station_id = $2`,
        [runId, stationId, completedChunks, totalChunks]
    );
    await db.query(
        `UPDATE sync_runs
         SET current_station_id = $2, current_chunk = $3,
             total_chunks = $4, heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, stationId, currentChunk, totalChunks]
    );
}

async function addStationReadings(runId, stationId, count) {
    if (!count) return;
    await db.query(
        `UPDATE sync_run_items
         SET readings_processed = readings_processed + $3
         WHERE run_id = $1 AND station_id = $2`,
        [runId, stationId, count]
    );
    await db.query(
        `UPDATE sync_runs
         SET readings_processed = readings_processed + $2, heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, count]
    );
}

async function finishStation(runId, stationId, status, errorMessage = null) {
    const counterColumn = {
        completed: 'successful_stations',
        failed: 'failed_stations',
        skipped: 'skipped_stations'
    }[status];
    if (!counterColumn) throw new Error(`Unsupported station sync status: ${status}`);

    const item = await db.query(
        `UPDATE sync_run_items
         SET status = $3, error_message = $4, completed_at = NOW()
         WHERE run_id = $1 AND station_id = $2 AND status IN ('queued', 'running')
         RETURNING id`,
        [runId, stationId, status, errorMessage]
    );
    if (item.rowCount === 0) return;

    await db.query(
        `UPDATE sync_runs
         SET processed_stations = processed_stations + 1,
             ${counterColumn} = ${counterColumn} + 1,
             heartbeat_at = NOW()
         WHERE id = $1`,
        [runId]
    );
}

async function setRunPhase(runId, phase) {
    await db.query(
        `UPDATE sync_runs
         SET phase = $2, current_station_id = NULL,
             current_chunk = NULL, total_chunks = NULL, heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, phase]
    );
}

async function finishRun(runId, fatalError = null) {
    const result = await db.query(
        `SELECT failed_stations FROM sync_runs WHERE id = $1`,
        [runId]
    );
    if (result.rows.length === 0) return;
    const failedStations = Number(result.rows[0].failed_stations || 0);
    const status = fatalError ? 'failed' : (failedStations > 0 ? 'partial' : 'completed');
    await db.query(
        `UPDATE sync_runs
         SET status = $2, phase = $3, error_message = $4,
             current_station_id = NULL, current_chunk = NULL, total_chunks = NULL,
             completed_at = NOW(), heartbeat_at = NOW()
         WHERE id = $1`,
        [runId, status, status, fatalError ? String(fatalError.message || fatalError) : null]
    );
}

async function listSyncRuns(page = 1, pageSize = 6) {
    await ensureSyncTrackingSchema();
    const requestedPage = Math.max(Math.floor(Number(page) || 1), 1);
    const safePageSize = Math.min(Math.max(Math.floor(Number(pageSize) || 6), 1), 25);
    const countResult = await db.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM sync_runs
         WHERE status NOT IN ('queued', 'running')`
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const offset = (safePage - 1) * safePageSize;
    const [activeResult, historyResult] = await Promise.all([
        db.query(
            `SELECT * FROM sync_runs
             WHERE status IN ('queued', 'running')
             ORDER BY created_at DESC`
        ),
        db.query(
            `SELECT * FROM sync_runs
             WHERE status NOT IN ('queued', 'running')
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [safePageSize, offset]
        )
    ]);
    const runs = [...activeResult.rows, ...historyResult.rows];
    const runIds = runs.map(run => run.id);
    let failures = [];
    if (runIds.length > 0) {
        const failureResult = await db.query(
            `SELECT run_id, station_id, station_name, error_message
             FROM sync_run_items
             WHERE run_id = ANY($1::bigint[]) AND status = 'failed'
             ORDER BY completed_at DESC`,
            [runIds]
        );
        failures = failureResult.rows;
    }
    const attachFailures = run => ({
        ...run,
        failures: failures.filter(item => String(item.run_id) === String(run.id))
    });
    return {
        active: activeResult.rows.map(attachFailures),
        history: historyResult.rows.map(attachFailures),
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            total,
            totalPages
        }
    };
}

async function getSyncRun(runId) {
    await ensureSyncTrackingSchema();
    const run = await db.query('SELECT * FROM sync_runs WHERE id = $1', [runId]);
    if (run.rows.length === 0) return null;
    const items = await db.query(
        `SELECT * FROM sync_run_items WHERE run_id = $1
         ORDER BY started_at NULLS LAST, station_id`,
        [runId]
    );
    return { ...run.rows[0], items: items.rows };
}

module.exports = {
    SyncAlreadyRunningError,
    ensureSyncTrackingSchema,
    createSyncRun,
    startRun,
    setRunStations,
    startStation,
    setStationChunks,
    addStationReadings,
    finishStation,
    setRunPhase,
    finishRun,
    listSyncRuns,
    getSyncRun
};
