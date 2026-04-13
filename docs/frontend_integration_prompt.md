# Frontend Prompt — Background Image Upload Integration

> Copy-paste this entire file into your frontend repo as the task brief for the image-upload feature. It is self-contained: all backend contracts, SSE event shapes, and UI behaviors are included.

---

## Context

The backend has been upgraded to support a **presigned-URL, direct-to-S3 upload model** with background processing. The old flow (multer upload through the server) is deprecated for images.

The backend is a Node.js/Express API with MongoDB + SSE. A BullMQ worker processes uploaded images (generates thumbnails + optimized variants via sharp), stores processed versions in S3, updates the `Message` document's `metadata.images` array, and broadcasts SSE events to every group member.

**Your job:** implement the frontend so that

1. Users can pick N images per message.
2. The message appears in chat **immediately** with placeholder tiles.
3. Uploads happen in the background and survive app kill.
4. When each image finishes processing, its tile swaps from placeholder → real image for **everyone in the chat** (not just the uploader).
5. Failed uploads show a retry UI.
6. On app relaunch, pending uploads are reconciled via a batch status endpoint.

---

## Required client libraries (React Native)

- `react-native-image-picker` (or `expo-image-picker`) — multi-select gallery picker
- `react-native-uuid` or `uuid` — for generating `imageId`s client-side
- `react-native-background-upload` — **critical**, this is what lets uploads survive app kill. It handles the raw `PUT` to S3 on the native side (iOS `URLSession` background tasks / Android `WorkManager`).
- `@react-native-async-storage/async-storage` — persist the list of pending `imageId`s so the app can reconcile on relaunch

Install:
```bash
npm i react-native-image-picker react-native-uuid react-native-background-upload @react-native-async-storage/async-storage
cd ios && pod install && cd ..
```

Configure `react-native-background-upload` per its README (iOS needs `UIBackgroundModes` + a custom Info.plist key; Android needs a `FileProvider` declaration).

---

## API contracts — what the backend expects

Base URL: `API_BASE_URL` (set per environment — e.g. `http://192.168.x.x:8082` for LAN testing on a physical phone, `https://api.yourapp.com` in prod). All requests require `Authorization: Bearer <access_token>`.

### 1. Create message (existing endpoint, now supports images)

**Request**
```
POST /v1/group/:groupId/messages
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "image",
  "content": "",                           // optional caption, can be empty for image-only
  "metadata": {
    "imageIds": ["uuid-1", "uuid-2", "uuid-3"]
  }
}
```

For direct messages, the equivalent is `POST /v1/group/dm/:recipientId/messages` with the same body.

**Response (201)**
```json
{
  "message": "Message sent successfully",
  "data": {
    "_id": "690ae7...",
    "group": "69d918...",
    "sender": "69d3ed...",
    "content": "",
    "type": "image",
    "metadata": {
      "imageIds": ["uuid-1", "uuid-2", "uuid-3"],
      "images": [
        { "imageId": "uuid-1", "status": "pending", "thumbnailUrl": null, "optimizedUrl": null, "width": null, "height": null },
        { "imageId": "uuid-2", "status": "pending", "thumbnailUrl": null, "optimizedUrl": null, "width": null, "height": null },
        { "imageId": "uuid-3", "status": "pending", "thumbnailUrl": null, "optimizedUrl": null, "width": null, "height": null }
      ]
    },
    "createdAt": "2026-04-13T09:32:46.624Z",
    "readBy": [],
    "deliveredTo": []
  }
}
```

The returned `data._id` is the Mongo message id — **use it as `messageId` in all subsequent upload calls**.

### 2. Request presigned upload URL

**Request**
```
POST /v1/media/upload/init
Authorization: Bearer <token>

{
  "chatId": "69d918...",                    // groupId
  "messageId": "690ae7...",                 // Message._id from step 1
  "imageId": "uuid-1",                      // the client-generated UUID for this image
  "mimeType": "image/jpeg",                 // one of: image/jpeg, image/png, image/webp, image/heic, image/heif, image/gif
  "sizeBytes": 4500000
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "presignedUrl": "https://bucket.s3.region.amazonaws.com/uploads/...",
    "s3Key": "uploads/69d918.../uuid-1.jpg",
    "imageId": "uuid-1",
    "expiresIn": 3600
  }
}
```

**Idempotent re-response** if this `imageId` was already fully processed:
```json
{
  "success": true,
  "data": {
    "alreadyComplete": true,
    "imageId": "uuid-1",
    "thumbnailUrl": "...",
    "optimizedUrl": "..."
  }
}
```
Treat `alreadyComplete: true` as success and skip the PUT + `/complete` calls.

**Errors**
- `403 E2E_004` — user not a member of the chat
- `413 E2E_005` — file exceeds 100 MB
- `400` — unsupported mime type or validation failure

### 3. Upload the file to S3

```
PUT <presignedUrl>
Content-Type: <exact same mimeType you sent to /init>
Body: raw file bytes
```

**CRITICAL:** the `Content-Type` header on the PUT **must** match the `mimeType` sent to `/init` exactly. Mismatches fail with `SignatureDoesNotMatch`. Do NOT send `Authorization`, `x-amz-*`, or any extra headers — the presigned URL already carries auth in the query string.

### 4. Confirm upload complete

**Request**
```
POST /v1/media/upload/complete
Authorization: Bearer <token>

{ "imageId": "uuid-1" }
```

**Response (200)**
```json
{ "success": true, "data": { "imageId": "uuid-1", "status": "processing" } }
```

If already finished:
```json
{ "success": true, "data": { "imageId": "uuid-1", "status": "completed", "thumbnailUrl": "...", "optimizedUrl": "..." } }
```

**Errors**
- `400` — file not found in S3 (upload never reached S3 — retry from `/init`)
- `403` — not the uploader
- `404` — no `MediaUpload` record (something went wrong in `/init`)

### 5. Single status check

```
GET /v1/media/upload/status/:imageId
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "imageId": "uuid-1",
    "status": "completed",
    "thumbnailUrl": "http://.../v1/media/uuid-1?variant=thumbnail",
    "optimizedUrl": "http://.../v1/media/uuid-1?variant=optimized",
    "width": 1920,
    "height": 1080
  }
}
```
Status enum: `pending`, `uploaded`, `processing`, `completed`, `failed`.

### 6. Batch status check (for app relaunch reconciliation)

**Request**
```
POST /v1/media/upload/status/batch
Authorization: Bearer <token>

{ "imageIds": ["uuid-1", "uuid-2", "uuid-3"] }
```

**Response**
```json
{
  "success": true,
  "data": {
    "uuid-1": { "status": "completed", "thumbnailUrl": "...", "optimizedUrl": "...", "width": 1920, "height": 1080 },
    "uuid-2": { "status": "processing" },
    "uuid-3": { "status": "failed" }
  }
}
```
Missing ids in the response = no record found (treat as failed).

### 7. Downloading an image

The `thumbnailUrl` / `optimizedUrl` you receive point to the backend (`{API_BASE_URL}/v1/media/:imageId?variant=thumbnail`). The backend returns a **302 redirect** to a short-lived presigned S3 GET URL. React Native's `<Image source={{ uri }} />` follows 302s automatically — no special handling needed.

Variants:
- `thumbnail` — 300×300 webp (chat list / grid preview)
- `optimized` — max 1200px webp (full-screen viewer)
- `original` — raw upload (only the uploader; generally avoid)

---

## SSE event contracts

Your app already subscribes to `GET /v1/sse/stream`. Add handlers for these four new events.

### `message.new` (already exists, now carries image placeholders)
Sent when a new message is created (text **or** image). For image messages, `metadata.images` is an array of pending placeholders. Render the message immediately — do not wait for image data.

```json
{
  "_id": "690ae7...",
  "group": "69d918...",
  "sender": "69d3ed...",
  "type": "image",
  "content": "",
  "metadata": {
    "imageIds": ["uuid-1", "uuid-2"],
    "images": [
      { "imageId": "uuid-1", "status": "pending", "thumbnailUrl": null, "optimizedUrl": null, "width": null, "height": null },
      { "imageId": "uuid-2", "status": "pending", "thumbnailUrl": null, "optimizedUrl": null, "width": null, "height": null }
    ]
  },
  "createdAt": "...",
  "readBy": [],
  "deliveredTo": []
}
```

### `upload:status` (uploader only)
Per-image progress for the client that initiated the upload. Use this to drive per-tile spinners / retry buttons in the sender's UI.
```json
{
  "imageId": "uuid-1",
  "messageId": "690ae7...",
  "chatId": "69d918...",
  "status": "completed",           // or "failed"
  "thumbnailUrl": "...",
  "optimizedUrl": "...",
  "width": 1920,
  "height": 1080,
  "allImagesComplete": false
}
```

### `message.image_updated` (all group members)
One image has finished (or failed) processing. Find the message by `messageId`, find the entry in `metadata.images` by `imageId`, and replace it with `image`.
```json
{
  "messageId": "690ae7...",
  "groupId": "69d918...",
  "imageId": "uuid-1",
  "image": {
    "imageId": "uuid-1",
    "status": "completed",
    "thumbnailUrl": "...",
    "optimizedUrl": "...",
    "width": 1920,
    "height": 1080
  },
  "allComplete": false
}
```

### `message.media_ready` (all group members)
All images for a message have finished. Optional — you can ignore this if `message.image_updated` already drives your UI incrementally. Useful for triggering an "all loaded" state or analytics.
```json
{
  "messageId": "690ae7...",
  "groupId": "69d918...",
  "images": [ /* full images array, all status='completed' */ ]
}
```

---

## Client implementation plan

### Step 1 — Upload queue module (`src/services/imageUploadQueue.ts`)

Build a singleton that owns the upload lifecycle. Persists pending uploads to `AsyncStorage` so nothing is lost if the app is killed mid-upload.

Persisted shape (AsyncStorage key `@pendingImageUploads`):
```ts
type PendingUpload = {
  imageId: string;
  messageId: string;
  chatId: string;
  localUri: string;        // file:// URI on device
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'initiating' | 'uploading' | 'completing' | 'done' | 'failed';
  attempts: number;
  lastError?: string;
};
```

API:
```ts
enqueue(uploads: PendingUpload[]): Promise<void>
processNext(): Promise<void>    // picks next pending, runs init → PUT → complete
reconcileOnLaunch(): Promise<void>  // called from App.tsx mount
retry(imageId: string): Promise<void>
```

`reconcileOnLaunch` logic:
1. Read all pending entries from storage.
2. Call `POST /v1/media/upload/status/batch` with their ids.
3. For each id: if server says `completed` → remove from queue; `failed` → mark failed in UI; `processing` or `uploaded` → leave alone, the worker is handling it; no record OR still local `pending` / `uploading` → resume the upload.

### Step 2 — Image picker + send flow (`src/screens/ChatScreen.tsx` or equivalent)

Pseudocode for "send images" button:

```ts
async function sendImages(files: PickedFile[]) {
  // 1. generate imageIds client-side
  const images = files.map(f => ({
    ...f,
    imageId: uuid.v4() as string,
  }));

  // 2. create the message on the server
  const { data: message } = await api.post(`/v1/group/${groupId}/messages`, {
    type: 'image',
    content: captionInput,               // may be empty string
    metadata: { imageIds: images.map(i => i.imageId) },
  });

  // 3. optimistic insert: the server will also send a `message.new` SSE event;
  //    dedupe by _id in your chat reducer so the message isn't shown twice
  dispatch(addMessage(message));

  // 4. enqueue uploads — the queue will run them in the background
  await uploadQueue.enqueue(
    images.map(img => ({
      imageId: img.imageId,
      messageId: message._id,
      chatId: groupId,
      localUri: img.uri,
      mimeType: img.type,
      sizeBytes: img.size,
      status: 'pending',
      attempts: 0,
    })),
  );
  uploadQueue.processNext();
}
```

### Step 3 — Background-capable PUT

Inside `processNext()`, use `react-native-background-upload`:

```ts
import Upload from 'react-native-background-upload';

async function uploadToS3(entry: PendingUpload, presignedUrl: string) {
  return new Promise<void>((resolve, reject) => {
    Upload.startUpload({
      url: presignedUrl,
      path: entry.localUri.replace('file://', ''),
      method: 'PUT',
      type: 'raw',
      headers: { 'Content-Type': entry.mimeType },     // must match /init mimeType
      notification: {
        enabled: true,
        autoClear: true,
        onProgressTitle: 'Uploading image…',
        onCompleteTitle: 'Image uploaded',
        onErrorTitle: 'Upload failed',
      },
    })
      .then(uploadId => {
        Upload.addListener('completed', uploadId, () => resolve());
        Upload.addListener('error', uploadId, err => reject(err));
        Upload.addListener('cancelled', uploadId, () => reject(new Error('cancelled')));
      })
      .catch(reject);
  });
}
```

Full per-entry flow:
```ts
async function runUpload(entry: PendingUpload) {
  try {
    update(entry.imageId, { status: 'initiating' });
    const { data } = await api.post('/v1/media/upload/init', {
      chatId: entry.chatId,
      messageId: entry.messageId,
      imageId: entry.imageId,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
    });

    if (data.alreadyComplete) {
      update(entry.imageId, { status: 'done' });
      return;
    }

    update(entry.imageId, { status: 'uploading' });
    await uploadToS3(entry, data.presignedUrl);

    update(entry.imageId, { status: 'completing' });
    await api.post('/v1/media/upload/complete', { imageId: entry.imageId });

    update(entry.imageId, { status: 'done' });
    // Don't remove from storage yet — wait for `message.image_updated` SSE
    // so the UI also updates; then remove.
  } catch (err) {
    const attempts = entry.attempts + 1;
    if (attempts >= 3) {
      update(entry.imageId, { status: 'failed', lastError: String(err), attempts });
    } else {
      update(entry.imageId, { attempts, lastError: String(err), status: 'pending' });
      setTimeout(() => processNext(), 2000 * 2 ** attempts);     // exponential backoff
    }
  }
}
```

### Step 4 — SSE handler updates (`src/services/sseClient.ts` or wherever you handle SSE)

Add handlers for the three new events. They mutate your chat/message store:

```ts
eventSource.addEventListener('message.new', (evt) => {
  const msg = JSON.parse(evt.data);
  store.dispatch(messageReceived(msg));    // existing
});

eventSource.addEventListener('upload:status', (evt) => {
  const payload = JSON.parse(evt.data);
  store.dispatch(uploadStatusChanged(payload));   // updates own uploader UI
});

eventSource.addEventListener('message.image_updated', (evt) => {
  const { messageId, groupId, imageId, image, allComplete } = JSON.parse(evt.data);
  store.dispatch(patchMessageImage({ groupId, messageId, imageId, image }));
  if (allComplete) uploadQueue.remove(imageId);
});

eventSource.addEventListener('message.media_ready', (evt) => {
  // optional: trigger haptic / analytics / etc.
});
```

Reducer helper:
```ts
function patchMessageImage(state, { groupId, messageId, imageId, image }) {
  const msg = state[groupId]?.messages.find(m => m._id === messageId);
  if (!msg?.metadata?.images) return state;
  const idx = msg.metadata.images.findIndex(i => i.imageId === imageId);
  if (idx === -1) return state;
  msg.metadata.images[idx] = image;
  return { ...state };
}
```

### Step 5 — Image message renderer (`src/components/ImageMessage.tsx`)

```tsx
function ImageMessage({ message }) {
  const images = message.metadata?.images ?? [];
  const columns = images.length === 1 ? 1 : 2;

  return (
    <View style={styles.grid(columns)}>
      {images.map(img => {
        if (img.status === 'completed') {
          return (
            <Pressable key={img.imageId} onPress={() => openLightbox(img.optimizedUrl)}>
              <Image
                source={{ uri: img.thumbnailUrl, headers: { Authorization: `Bearer ${token}` } }}
                style={styles.tile(img.width, img.height)}
              />
            </Pressable>
          );
        }
        if (img.status === 'failed') {
          return (
            <Pressable key={img.imageId} onPress={() => uploadQueue.retry(img.imageId)} style={styles.failedTile}>
              <Text>Failed — tap to retry</Text>
            </Pressable>
          );
        }
        // pending / processing
        return (
          <View key={img.imageId} style={styles.placeholderTile}>
            <ActivityIndicator />
          </View>
        );
      })}
      {message.content ? <Text style={styles.caption}>{message.content}</Text> : null}
    </View>
  );
}
```

**Note on image headers:** because `thumbnailUrl` points to the backend (which redirects to S3 with an auth-free presigned URL), you may or may not need the `Authorization` header depending on your middleware. If the `/v1/media/:id?variant=` route requires auth (it currently does), you have two options:

- **Option A (simpler):** attach `Authorization` header to the `<Image>` source. Works on iOS/Android with RN's built-in fetcher.
- **Option B:** fetch a presigned URL once via `/v1/media/:id?variant=thumbnail` (use `fetch` with redirect: 'manual' to capture the `Location` header), cache it, and set `<Image source={{ uri: <presignedUrl> }} />`. No auth needed, but presigned URLs expire — refresh on 403.

Option A is fine to start. Move to B if you hit performance issues.

### Step 6 — App-mount reconciliation

In `App.tsx`:
```ts
useEffect(() => {
  uploadQueue.reconcileOnLaunch();
}, []);
```

### Step 7 — Network / environment config

Update `src/config.ts`:
```ts
export const API_BASE_URL =
  __DEV__
    ? 'http://192.168.x.x:8082'          // your Mac's LAN IP, NOT localhost — phone can't resolve localhost
    : 'https://api.yourapp.com';
```

---

## Edge cases to handle

- **User kills app mid-upload:** covered by background-upload lib + `reconcileOnLaunch`.
- **User deletes a pending-image message:** cancel in-flight uploads (`Upload.cancelUpload(uploadId)`) and remove entries from the queue.
- **User has no network:** uploads fail fast in `/init`; mark as `pending` and retry when network returns (subscribe to `NetInfo`).
- **Duplicate `message.new` arrival:** because you optimistically insert the message locally and the server also broadcasts it via SSE, dedupe by `_id` in your message reducer.
- **HEIC on Android:** Android's gallery sometimes returns HEIC files that sharp can't decode on certain server configs. If you hit processing failures for HEIC, convert client-side to JPEG before upload (use `react-native-image-resizer`).
- **Very large images:** if the selected image is > 100 MB, show an error before calling `/init` (backend rejects with `E2E_005`).
- **Retry exhausted:** after 3 failed attempts, show the "Failed — tap to retry" tile. Tap should reset attempts to 0 and restart from `/init` (init is idempotent on `imageId`).

---

## Deprecations

- **Do not use** the old `POST /v1/media/upload` (multer-based) for images anymore. Keep it only if you still need it for non-image encrypted blobs.

---

## Testing checklist

- [ ] Single image send: message appears instantly with placeholder → swaps to thumbnail within a few seconds.
- [ ] Multi image send (4+): all tiles appear as placeholders, each swaps independently as it finishes.
- [ ] Recipient in same chat sees the message appear and tiles populate without any action.
- [ ] Kill the app right after hitting send → relaunch → uploads resume; message eventually completes on both devices.
- [ ] Disable network during upload → failed tile appears with retry; re-enable network and tap retry → succeeds.
- [ ] Send >100 MB image → rejected with friendly error, no tile created.
- [ ] Send one HEIC image from iOS → processes and renders as webp thumbnail.
- [ ] Tap completed tile → opens full-screen viewer using `optimizedUrl`.
- [ ] Send an image-only message (no caption) → works with empty content.
- [ ] Caption + images → both render together.
