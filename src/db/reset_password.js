const db = require('./index.js');
const { hashPassword } = require('../utils/auth.js');

const readHidden = (prompt) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Password reset must be run from an interactive terminal.');
    }

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    return new Promise((resolve, reject) => {
        let value = '';

        const finish = () => {
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
        };

        const onData = (input) => {
            for (const character of input) {
                if (character === '\u0003') {
                    finish();
                    reject(new Error('Password reset cancelled.'));
                    return;
                }

                if (character === '\r' || character === '\n') {
                    finish();
                    resolve(value);
                    return;
                }

                if (character === '\u007f' || character === '\b') {
                    if (value.length > 0) {
                        value = value.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    continue;
                }

                value += character;
                process.stdout.write('*');
            }
        };

        process.stdin.on('data', onData);
    });
};

const resetPassword = async () => {
    const username = process.argv[2]?.trim();

    if (!username) {
        throw new Error('Usage: npm run reset-password -- <username>');
    }

    const userResult = await db.query(
        'SELECT id, username FROM users WHERE username = $1',
        [username]
    );

    if (userResult.rowCount === 0) {
        throw new Error(`User "${username}" was not found.`);
    }

    const password = await readHidden('New password: ');
    const confirmation = await readHidden('Confirm new password: ');

    if (!password) {
        throw new Error('Password cannot be empty.');
    }

    if (password !== confirmation) {
        throw new Error('Passwords do not match.');
    }

    const passwordHash = await hashPassword(password);
    await db.query(
        'UPDATE users SET password = $1 WHERE id = $2',
        [passwordHash, userResult.rows[0].id]
    );

    console.log(`Password reset successfully for "${userResult.rows[0].username}".`);
};

resetPassword()
    .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.pool.end();
    });
