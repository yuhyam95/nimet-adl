async function recordAudit(queryable, req, action, targetType, targetId, details = {}) {
    try {
        await queryable.query(
            `INSERT INTO security_audit_log (
                action, user_id, username, target_type, target_id,
                details, ip_address, user_agent
             ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
            [
                action,
                req.user?.id || null,
                req.user?.username || null,
                targetType,
                targetId == null ? null : String(targetId),
                JSON.stringify(details || {}),
                req.ip || req.socket?.remoteAddress || null,
                req.get?.('user-agent') || null
            ]
        );
    } catch (error) {
        console.error(`Could not write security audit event ${action}:`, error.message);
    }
}

module.exports = { recordAudit };
