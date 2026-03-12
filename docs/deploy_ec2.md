# AWS EC2 Deployment Guide: ThafEngine (API & Tracking)

Follow these steps to deploy your services on AWS EC2 with SSL (WSS) and zero-downtime CI/CD.

## 1. AWS EC2 Instance Setup

### Step 1.1: Launch Instance
1. Go to **AWS Console** > **EC2** > **Launch Instance**.
2. **Name**: `ThafEngine`.
3. **OS**: `Ubuntu 22.04 LTS`.
4. **Instance Type**: `t3.micro` (or `t2.micro` if eligible for free tier).
5. **Key Pair**: Create or select an existing `.pem` key. **Download and keep it safe**.

### Step 1.2: Configure Security Group
In the **Network Settings** section or after launching via **Security Groups** > **Edit Inbound Rules**:

| Type | Protocol | Port Range | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | 22 | **My IP** | **CRITICAL**: Only you can SSH |
| **HTTP** | TCP | 80 | 0.0.0.0/0 | Initial web traffic |
| **HTTPS** | TCP | 443 | 0.0.0.0/0 | Secure API & WSS |

> [!WARNING]
> **DO NOT** open ports 8081 or 9001 in AWS. Nginx will handle routing internally. Opening these raw ports bypasses your security.

3. Choose your `ThafEngine` instance.

### Step 1.4: DNS Configuration (Crucial for SSL)
Before you can use `HTTPS` or run `Certbot`, you must point your domain to your Elastic IP:
1. Go to your **DNS Provider** (GoDaddy, Namecheap, Cloudflare, etc.).
2. Add an **A Record**:
   - **Host**: `api` (for `api.tankhalfull.com`)
   - **Value**: Your **Elastic IP Address**.
3. **Wait**: It can take 5–30 minutes for DNS to propagate. You can check it at [dnschecker.org](https://dnschecker.org).

---

## 2. Server Environment Setup

> [!NOTE]
> **Where to run these?**: Run the `ssh` command in your **Local Terminal** (Mac Terminal, iTerm2, etc.). Once you are logged into the server, all following commands are run inside that **Server Terminal**.

### Step 2.1: Login via SSH
Before connecting, you must set the correct permissions for your key file, otherwise SSH will reject it:

1. **Fix Key Permissions**:
   ```bash
   chmod 400 Downloads/THaF-Engine.pem
   ```

2. **Connect**:
   ```bash
   ssh -i Downloads/THaF-Engine.pem ubuntu@your-elastic-ip
   ```

### Step 2.1: Install Node.js & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### Step 2.2: Setup Nginx
```bash
sudo apt update
sudo apt install nginx -y
```

Create a new Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/thafengine
```

Paste this configuration (Use your **IP address** instead of a domain):
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    # Main API
    location /v1/ {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Tracking Server (WebSocket)
    location /tracking/ {
        proxy_pass http://localhost:9001/; # Note the trailing slash
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### How to Save & Exit Nano:
1. Press `Ctrl + O` (this means "Write Out").
2. Press `Enter` to confirm the filename.
3. Press `Ctrl + X` to exit the editor.

Enable the config and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/thafengine /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 3. Manual Deployment (Before CI/CD)

If you aren't ready for GitHub Actions yet, you can deploy manually:

### Step 3.1: Get the Code
```bash
# Clone the repository
git clone https://github.com/your-username/your-repo.git ~/thafengine
cd ~/thafengine
```

### Step 3.2: Configure Environment
Copy your `.env` content from your local machine to the server:
```bash
nano .env
```
*Paste your `.env` content, save and exit (Ctrl+O, Enter, Ctrl+X).*

### Step 3.3: Install & Build
```bash
npm install
npm run build
```

### Step 3.4: Start with PM2
```bash
# Start both API and Tracking server
pm2 start ecosystem.config.cjs

# To see logs:
pm2 logs

# To check status:
pm2 status
```

---

## 4. Future: SSL Setup (Once you have a domain)

Once you have your domain pointing to your IP:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.tankhalfull.com
```
This will automatically update your Nginx config to use `https://` and `wss://`.

---

## 4. CI/CD with GitHub Actions (Future Setup)

### Step 3.1: Create Deployment User (Optional but Recommended)
Or use the `ubuntu` user with an SSH key.

### Step 3.2: Configure GitHub Secrets
In your GitHub Repo > **Settings** > **Secrets and variables** > **Actions**:
- `EC2_SSH_KEY`: Content of your `.pem` file.
- `HOST`: Your Elastic IP or Domain.
- `USER`: `ubuntu`.

### Step 3.3: Workflow File
Created at `.github/workflows/deploy.yml` in your local project (see file contents).

---

## 4. Security Hardening (Abuse Prevention)

### Step 4.1: Nginx Rate Limiting
> [!IMPORTANT]
> **Don't run these in terminal!** These are **Configuration Directives**. You must add them to the Nginx configuration files as described below.

1. **Global Configuration**:
   Open the global Nginx file:
   ```bash
   sudo nano /etc/nginx/nginx.conf
   ```
   Add this line inside the **`http { ... }`** block:
   ```nginx
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
   ```
*   **`rate=10r/s`**: This is the speed limit. Each IP can only send 10 requests per second.
*   **`zone=api_limit:10m`**: This allocates 10MB of RAM to track IPs (enough for ~160k users).

Then, add this line inside your `location /v1/` block in `/etc/nginx/sites-available/thafengine`:
```nginx
limit_req zone=api_limit burst=20 nodelay;
```
*   **`burst=20`**: This allows a "spike" of up to 20 extra requests before it starts blocking. Useful for mobile apps that might send 3-4 requests at once when a screen loads.
*   **`nodelay`**: Processes spikes immediately rather than making the user wait.

### Step 4.2: Application Hardening (JWT)
Ensure your `JWT_SECRET` is complex (at least 32 characters). This prevents attackers from forging tokens to skip the "handshake".

### Step 4.3: Port Lockdown Check
Run `curl localhost:8081` on the server to see it works. Then try `curl your-ip:8081` from your local laptop — it should **fail** or timeout. This confirms your Security Group is correctly shielding your backend from public access.

---

## 6. Frontend Consumption

Update your frontend connection string in `useTracking.ts`:

```diff
- wsUrl: 'ws://localhost:9001',
+ wsUrl: 'ws://YOUR_EC2_IP/tracking',
```

> [!IMPORTANT]
> Since we aren't using SSL (HTTPS) with the raw IP yet, you must use **`ws://`** (not `wss://`) and **`http://`** (not `https://`).

> [!NOTE]
> Because we used `location /tracking/` in Nginx, you should connect to `/tracking` without the port `9001`. Nginx handles the routing internally to `localhost:9001`.

---

## 5. Persistence & Zero-Downtime
We use `pm2 reload all` in the CI/CD script. Unlike `restart`, `reload` keeps at least one process running if you have multiple instances, or starts a new one before killing the old one for a near-zero downtime transition.

---

## 7. Troubleshooting & Common Tasks

### SSH: Operation timed out
If you see `connect to host ... port 22: Operation timed out`:

1.  **Check Security Group (Most Common)**: 
    - Go to **EC2** > **Instances** > Click your instance.
    - Click the **Security** tab > Click the Security Group link.
    - Edit **Inbound Rules**.
    - Ensure **SSH (Port 22)** is set to **My IP**. (If your local internet IP changed, you must update this rule).
2.  **Verify Instance State**: Ensure the instance status is **Running** in the AWS Console.
3.  **Check Elastic IP**: Verify you are using the correct **Elastic IP** address.
4.  **Local Network/VPN**: Some corporate or public Wi-Fi networks block Port 22. Try a different network or turn off VPN.

### How to Switch to a New Repository
If you accidentally cloned the wrong repo or need to switch to a different one:

**Option A: Fresh Start (Recommended)**
```bash
cd ~
sudo rm -rf thafengine
git clone https://github.com/your-username/correct-repo.git thafengine
cd thafengine
# Remember to re-run npm install and re-create your .env file!
```

**Option B: Change Remote URL**
```bash
cd ~/thafengine
git remote set-url origin https://github.com/your-username/correct-repo.git
git fetch
git reset --hard origin/main
```

### How to Test WebSockets (Thaf-piston)

**Postman Method:**
1. Click **New** > **WebSocket Request**.
2. URL: `ws://api.tankhalfull.com/tracking/?groupId=test-group` (Note: `groupId` is **required**).
3. Headers: Add `Authorization: Bearer YOUR_JWT_TOKEN`.
4. Click **Connect**.

**Command Line Method (Local Mac):**
Install `wscat` (like `curl` for WebSockets):
```bash
npm install -g wscat
```
Connect and test:
```bash
wscat -c "ws://api.tankhalfull.com/tracking/?groupId=test-group" -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Once connected, try sending a JSON location update to see if it relays!
