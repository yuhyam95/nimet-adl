const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const configuredSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

if (!configuredSecret) {
    console.warn('JWT_SECRET is not configured. Using a development-only secret; never use this outside development.');
}

const JWT_SECRET = configuredSecret || 'development-only-secret-not-for-production';

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

module.exports = {
    generateToken,
    verifyToken,
    hashPassword,
    comparePassword
};
