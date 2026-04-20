const { verifyToken } = require('../utils/auth.js');

const protect = (roles = []) => {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Not authorized, no token' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        if (!decoded) {
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }

        req.user = decoded;

        if (roles.length > 0 && !roles.includes(decoded.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `User role ${decoded.role} is not authorized to access this route` 
            });
        }

        next();
    };
};

module.exports = { protect };
