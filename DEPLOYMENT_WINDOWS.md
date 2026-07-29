# Windows Deployment Guide

This guide provides step-by-step instructions for deploying the NiMet Automated Data Loader on a Windows system (Windows Server or Windows 10/11 Pro).

## System Prerequisites
- **Node.js**: v18 or v20 (Download from [nodejs.org](https://nodejs.org/))
- **PostgreSQL**: v14 or later (Download from [postgresql.org](https://www.postgresql.org/download/windows/))
- **Process Manager**: PM2
- **Web Server**: Nginx for Windows (Alternatively, IIS can be used with IISNode and URL Rewrite)

## 1. Database Setup

1. Run the PostgreSQL Windows installer. Write down the superuser password you choose during installation.
2. Open **pgAdmin 4** (installed along with PostgreSQL) or the **SQL Shell (psql)** tool.
3. Open a Query tool and create the required database and user by executing:
   ```sql
   CREATE DATABASE nimet_adl;
   CREATE USER nimet_user WITH ENCRYPTED PASSWORD 'password';
   GRANT ALL PRIVILEGES ON DATABASE nimet_adl TO nimet_user;
   \c nimet_adl
   GRANT ALL ON SCHEMA public TO nimet_user;
   ```
   *(Update the password as needed, making sure it matches your `.env` configuration)*

## 2. Backend Setup

1. Open PowerShell or Command Prompt.
2. Navigate to where you want the project hosted (e.g., `C:\nimet-adl`).
3. Clone the repository:
   ```cmd
   git clone <your-repo-url> C:\nimet-adl
   cd C:\nimet-adl
   ```
4. Install backend dependencies:
   ```cmd
   npm install
   ```
5. Set up environment variables:
   - Make a copy of `.env.example` and rename it to `.env`.
   - Open `.env` in Notepad and insert your database credentials ensuring they map to the PostgreSQL steps above (`DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, and `DB_HOST=localhost`).
6. Initialize the database schemas:
   ```cmd
   node src\db\apply_init.js
   node src\db\migrate_mappings.js
   node src\db\seed_admin.js
   ```

### Running Node.js as a Windows Service

To ensure the backend starts when Windows boots up automatically, we use PM2 with a Windows service wrapper.

1. Install PM2 and the Windows startup tool globally:
   ```cmd
   npm install -g pm2
   npm install -g pm2-windows-startup
   ```
2. Install the PM2 startup script system:
   ```cmd
   pm2-startup install
   ```
3. Start your backend program:
   ```cmd
   pm2 start src\server.js --name "nimet-adl-backend"
   pm2 save
   ```

## 3. Frontend Setup

1. Open a new Command Prompt or PowerShell and navigate to the frontend folder:
   ```cmd
   cd C:\nimet-adl\frontend
   ```
2. Install dependencies:
   ```cmd
   npm install
   ```
3. Build the static files for production (this bundles the React frontend using Vite):
   ```cmd
   npm run build
   ```
   *This creates a `dist` folder located at `C:\nimet-adl\frontend\dist` containing all production web assets.*

## 4. Nginx Configuration for Windows

Nginx is used to expose the frontend UI efficiently and proxy internal API requests correctly to the Node.js backend.

1. Download **Nginx for Windows** from [nginx.org/en/download.html](http://nginx.org/en/download.html) (download the mainline zip file).
2. Extract the ZIP file to the root of your `C:` drive and rename the folder to `nginx` (e.g., `C:\nginx`).
3. Open `C:\nginx\conf\nginx.conf` in a text editor (like Notepad++ or VS Code).
4. Remove or comment out the existing default `server { ... }` block inside the `http` context, and add the following block:

   ```nginx
   server {
       listen       80;
       server_name  localhost; # Replace with your domain or server IP if deploying publicly

       # Serve Frontend Static Files
       location / {
           root C:/nimet-adl/frontend/dist;
           index index.html;
           # Fallback matching for React Router
           try_files $uri $uri/ /index.html;
       }

       # Proxy API Requests to Backend
       location /api/ {
           proxy_pass http://127.0.0.1:3000/api/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   *Important Note: Always use forward slashes `/` parameter for Nginx file paths on Windows.*
5. Start Nginx:
   - Open Command Prompt.
   - Navigate to the Nginx directory and start the service:
     ```cmd
     cd C:\nginx
     start nginx
     ```
   *(Routine Commands: Use `nginx -s reload` to restart configurations and `nginx -s quit` to terminate Nginx).*

## 5. Maintenance and Logging

- **To view live Backend Logs:**  
  Run `pm2 logs nimet-adl-backend` in the Command Prompt.
  
- **Steps to update the application from Github:**
  ```cmd
  cd C:\nimet-adl
  git pull origin main
  
  :: Backend Updates
  npm install
  pm2 restart nimet-adl-backend

  :: Frontend Updates
  cd frontend
  npm install
  npm run build
  ```
