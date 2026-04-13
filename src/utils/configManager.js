const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');

const updateEnv = (updates) => {
    try {
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const lines = envContent.split(/\r?\n/);

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined) return;
            
            const index = lines.findIndex(line => line.startsWith(`${key}=`));
            const newLine = `${key}=${value}`;

            if (index !== -1) {
                lines[index] = newLine;
            } else {
                lines.push(newLine);
            }
            
            // Also update current process.env
            process.env[key] = value;
        });

        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
        return true;
    } catch (error) {
        console.error('Error updating .env file:', error);
        return false;
    }
};

module.exports = { updateEnv };
