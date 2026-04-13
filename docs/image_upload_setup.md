# Image Upload System — Setup Guide

This guide walks through setting up the infrastructure required by the background image upload feature (presigned S3 URLs + BullMQ processing + SSE notifications).

## Architecture Overview

```
Client ──(1) init──▶ Server ──▶ MongoDB (MediaUpload record)
Client ──(2) PUT──▶ S3 (uploads/)
Client ──(3) complete──▶ Server ──▶ BullMQ (Redis)
                                      │
                                      ▼
                              Worker (sharp processing)
                              ├─▶ S3 (thumbs/, optimized/)
                              ├─▶ MongoDB (update status)
                              └─▶ SSE (notify clients)
```

**Required infrastructure:** Redis (for BullMQ), AWS S3 bucket, IAM credentials.

---

## 1. Redis Setup (Local Dev)

Redis is required for the BullMQ job queue. Without it you'll see:
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

### macOS (Homebrew)

```bash
brew install redis
brew services start redis          # starts now and on login
```

Verify:
```bash
redis-cli ping
# → PONG
```

### Docker (alternative, no install)

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### Foreground (no auto-start)

```bash
redis-server     # Ctrl+C to stop
```

### Stopping / restarting

```bash
brew services stop redis
brew services restart redis
```

### `.env` configuration

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

For production, set `REDIS_HOST` to your managed Redis endpoint (ElastiCache, Upstash, etc.) and supply `REDIS_PASSWORD` if required.

---

## 2. AWS S3 Setup

### 2.1 Pick the AWS Region

The AWS Console shows the current region in the **top-right** (next to your account name). Click the region dropdown and pick one close to your users — e.g. **Asia Pacific (Mumbai) ap-south-1**, **US East (N. Virginia) us-east-1**, or **Asia Pacific (Sydney) ap-southeast-2**.

**Important:** S3 buckets are region-bound. Whichever region you create the bucket in must match `AWS_REGION` in `.env`.

If the region selector is locked, your IAM user may be restricted — either use the locked region or have the account admin widen your permissions.

### 2.2 Create the S3 Bucket

AWS Console → **S3** → **Create bucket**

- **Name:** `circles-e2ee-media` (must be globally unique — pick a variant if taken)
- **Region:** the one you selected above
- **Block all public access:** ✅ leave ON (we use presigned URLs; never make the bucket public)
- Leave everything else default → **Create bucket**

### 2.3 Configure CORS

Presigned uploads are direct browser/app → S3 PUT requests, which require CORS.

Bucket → **Permissions** tab → **Cross-origin resource sharing (CORS)** → Edit:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

In production, replace `"*"` with your actual app origins (e.g. `"https://app.yourdomain.com"`).

### 2.4 Create an IAM Policy

IAM → **Policies** → **Create policy** → **JSON** tab:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::circles-e2ee-media/*"
    }
  ]
}
```

- Replace `circles-e2ee-media` with your bucket name.
- Note: `s3:HeadObject` is **not** a valid IAM action — `HeadObject` API calls are authorized by `s3:GetObject`.
- Name: `CirclesS3Access` → **Create policy**.

### 2.5 Create an IAM User (for local dev)

IAM → **Users** → **Create user**

- **Name:** `circles-s3-uploader`
- Skip "Provide user access to AWS Management Console"
- **Next → Attach policies directly →** attach `CirclesS3Access`
- **Create user**

### 2.6 Generate Access Keys

Click the new user → **Security credentials** tab → **Create access key**

- **Use case:** Select **"Application running outside AWS"**
  (This only affects the advisory banner; it's a normal access key that works anywhere.)
- Copy the **Access key ID** and **Secret access key** — the secret is shown **once**.

### 2.7 Populate `.env`

```env
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="AKIA...your-actual-key"
AWS_SECRET_ACCESS_KEY="your-actual-secret"
AWS_S3_BUCKET="circles-e2ee-media"
```

Region must exactly match the bucket's region.

---

## 3. Production on EC2 — Use IAM Roles (Recommended)

**Don't** copy static access keys onto EC2 instances. Use an IAM Role instead — credentials are injected automatically and rotated by AWS.

### 3.1 Create an IAM Role for EC2

IAM → **Roles** → **Create role**

- **Trusted entity type:** AWS service
- **Use case:** EC2
- **Next** → attach `CirclesS3Access` policy
- Name: `CirclesEC2Role` → **Create role**

### 3.2 Attach the role to your EC2 instance

EC2 console → your instance → **Actions → Security → Modify IAM role** → pick `CirclesEC2Role` → **Update**

### 3.3 Remove static keys from production `.env`

```env
AWS_REGION="ap-south-1"
AWS_S3_BUCKET="circles-e2ee-media"
# No AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY needed
```

The AWS SDK's default credential chain automatically picks up the instance role. The same code works in both local dev (env vars) and EC2 (instance role) — no code changes needed.

---

## 4. S3 Folder Structure

After setup, S3 will look like this:

```
circles-e2ee-media/
├── uploads/              ← raw client uploads (cleaned after 7 days by cron)
│   └── {chatId}/{imageId}.jpg
├── thumbs/               ← 300x300 webp thumbnails (permanent)
│   └── {chatId}/{imageId}.webp
├── optimized/            ← max-1200px webp (permanent)
│   └── {chatId}/{imageId}.webp
└── media/                ← legacy encrypted uploads (existing path)
    └── {chatId}/{mediaId}.bin
```

---

## 5. Verify End-to-End

1. **Start Redis:** `redis-cli ping` → `PONG`
2. **Start the server:** `npm run dev`
3. Look for these logs:
   - `MongoDB Connected: ...`
   - `[cron] Upload reconciliation and cleanup crons scheduled`
   - No `ECONNREFUSED` errors
4. From the app, call `POST /v1/media/upload/init` — response should include a `presignedUrl`.
5. PUT the image to that URL — should return 200.
6. Call `POST /v1/media/upload/complete` — response `{ status: 'processing' }`.
7. Within a few seconds, an SSE `upload:status` event should arrive with `status: 'completed'` and `thumbnailUrl` / `optimizedUrl`.

---

## 6. Security Checklist

- ✅ `.env` is in `.gitignore` — AWS scans GitHub for leaked keys and disables them automatically.
- ✅ IAM policy is scoped to a single bucket (`arn:aws:s3:::circles-e2ee-media/*`).
- ✅ S3 bucket has **Block all public access** enabled.
- ✅ Never use root account access keys.
- ✅ Production CORS restricted to your actual app origins (not `*`).
- ✅ Production uses IAM Roles on EC2, not static keys.
- ✅ Redis is not exposed on a public port in production (bind to VPC / use ElastiCache).

---

## 7. Environment Variable Reference

```env
# Redis (BullMQ)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# AWS S3
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="AKIA..."           # omit on EC2 with instance role
AWS_SECRET_ACCESS_KEY="..."           # omit on EC2 with instance role
AWS_S3_BUCKET="circles-e2ee-media"

# API base URL (for URLs in SSE payloads and DB records)
API_BASE_URL="http://localhost:8082"  # or https://api.yourapp.com in prod
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:6379` | Redis not running | `brew services start redis` |
| `AccessDenied` on S3 PUT | IAM policy missing `s3:PutObject` or wrong bucket ARN | Check policy JSON, re-attach |
| `SignatureDoesNotMatch` on PUT | `AWS_REGION` doesn't match bucket's region | Update `AWS_REGION` in `.env` |
| `NoSuchBucket` | Bucket name typo or wrong region | Verify `AWS_S3_BUCKET` and `AWS_REGION` |
| CORS error in browser on PUT | Bucket CORS not set or wrong origin | Add CORS JSON from §2.3 |
| Worker runs but no SSE event | Client not connected to `/v1/sse/stream` | Open the SSE stream first, then upload |
| `The action s3:HeadObject does not exist` | Non-existent IAM action | Use `s3:GetObject` (covers HeadObject too) |
