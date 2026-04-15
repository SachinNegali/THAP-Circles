# Developer prompt — in-chat expense management engine

---

## Context and constraints

You are building an expense management engine that lives inside an existing real-time messaging application. The app already has working `Message` and `Group` Mongoose models (schemas provided below). The expense engine must integrate seamlessly into the messaging flow — expenses appear as chat messages of `type: 'spend'`, alongside regular text and media messages.

**Stack**: Node.js, Express, MongoDB/Mongoose, Socket.IO (already wired for real-time messaging), an existing notification service.

**Core rules to keep in mind throughout:**
- Expenses are posted as messages (`type: 'spend'`). The `Message` model is not to be modified — use its existing `metadata` field to store expense references.
- Both groups and DMs use the same `Group` model (`type: 'group' | 'dm'`). All expense logic must work for both.
- Any group member who has messaging access can add an expense.
- Currency is set once per group and fixed for all expenses in that group.
- The 10-minute edit/delete window is enforced server-side. Only the creator of the expense can edit or delete within that window.
- Split is equal by default. Custom splits are supported when explicitly provided — custom split amounts must sum to the total expense amount (validated server-side).
- The payer defaults to the message sender. A different `paidBy` user can be specified (must be a group member).
- Debt simplification (net balance graph reduction) is scoped per group per active cycle.
- Settlement requires mutual confirmation — either party initiates, the other confirms.
- Nudge is rate-limited to one per 24 hours per debt pair (from_user → to_user). Only the creditor can nudge the debtor.
- Expense comments are only allowed from the expense creator (the person who added the expense).

---

## Existing Mongoose schemas (do not modify)

### Message model

```js
import mongoose, { Types } from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    group: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
    sender: { type: Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 5000 },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system', 'spend'],
      default: 'text',
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    readBy: [{ type: Types.ObjectId, ref: 'User' }],
    deliveredTo: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);
```

### Group model

```js
import mongoose, { Types } from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: function () { return this.type === 'group'; }, trim: true, maxlength: 100 },
    type: { type: String, enum: ['dm', 'group'], default: 'group', index: true },
    description: { type: String, trim: true, maxlength: 500 },
    avatar: { type: String, default: null },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        user: { type: Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    settings: {
      onlyAdminsCanMessage: { type: Boolean, default: false },
      onlyAdminsCanEditInfo: { type: Boolean, default: true },
      maxMembers: { type: Number, default: 256, max: 1024 },
    },
    isActive: { type: Boolean, default: true },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
```

---

## Mongoose schemas to create

### 1. `ExpenseCycle`

```js
{
  group:       { type: ObjectId, ref: 'Group', required: true, index: true },
  status:      { type: String, enum: ['active', 'closed'], default: 'active' },
  currency:    { type: String, required: true },
  createdBy:   { type: ObjectId, ref: 'User', required: true },
  startedAt:   { type: Date, default: Date.now },
  closedAt:    { type: Date, default: null },
  closeReason: { type: String, default: null }
}
// Indexes: { group: 1, status: 1 }
```

Only one cycle can be `active` per group at a time. Enforce this in the service layer before creating a new cycle (throw if one exists). When a new cycle is started, the previous cycle is closed and all unsettled `ExpenseSplit` entries for that cycle are summarised into `BalanceForward` documents and carried into the new cycle.

### 2. `Expense`

```js
{
  cycle:         { type: ObjectId, ref: 'ExpenseCycle', required: true, index: true },
  group:         { type: ObjectId, ref: 'Group', required: true, index: true },
  message:       { type: ObjectId, ref: 'Message', required: true },
  paidBy:        { type: ObjectId, ref: 'User', required: true },
  amount:        { type: Number, required: true, min: 0.01 },
  category:      { type: String, required: true, trim: true, maxlength: 50 },
  note:          { type: String, default: '', maxlength: 500 },
  imageUrl:      { type: String, default: null },
  splitType:     { type: String, enum: ['equal', 'custom'], default: 'equal' },
  createdBy:     { type: ObjectId, ref: 'User', required: true },
  editableUntil: { type: Date, required: true },
  isDeleted:     { type: Boolean, default: false }
}
// Indexes: { group: 1, cycle: 1, createdAt: -1 }, { group: 1, category: 1 }
```

`editableUntil` = `createdAt + 10 minutes`. Set on document creation.

### 3. `ExpenseSplit`

```js
{
  expense:     { type: ObjectId, ref: 'Expense', required: true, index: true },
  cycle:       { type: ObjectId, ref: 'ExpenseCycle', required: true, index: true },
  group:       { type: ObjectId, ref: 'Group', required: true, index: true },
  user:        { type: ObjectId, ref: 'User', required: true },
  shareAmount: { type: Number, required: true },
  status:      { type: String, enum: ['pending', 'settlement_initiated', 'settled'], default: 'pending' }
}
// Indexes: { cycle: 1, user: 1 }, { cycle: 1, status: 1 }
```

### 4. `Settlement`

```js
{
  cycle:       { type: ObjectId, ref: 'ExpenseCycle', required: true, index: true },
  group:       { type: ObjectId, ref: 'Group', required: true },
  fromUser:    { type: ObjectId, ref: 'User', required: true },
  toUser:      { type: ObjectId, ref: 'User', required: true },
  amount:      { type: Number, required: true },
  status:      { type: String, enum: ['pending_confirmation', 'confirmed', 'cancelled'], default: 'pending_confirmation' },
  initiatedBy: { type: ObjectId, ref: 'User', required: true },
  initiatedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null }
}
```

On confirmation, update all `ExpenseSplit` documents for this `(fromUser, toUser, cycle)` pair where `shareAmount` is covered by the settlement amount from `pending` or `settlement_initiated` → `settled`.

### 5. `BalanceForward`

```js
{
  group:     { type: ObjectId, ref: 'Group', required: true, index: true },
  fromUser:  { type: ObjectId, ref: 'User', required: true },
  toUser:    { type: ObjectId, ref: 'User', required: true },
  amount:    { type: Number, required: true },
  fromCycle: { type: ObjectId, ref: 'ExpenseCycle', required: true },
  toCycle:   { type: ObjectId, ref: 'ExpenseCycle', required: true }
}
// Index: { group: 1, toCycle: 1 }
```

### 6. `Nudge`

```js
{
  group:        { type: ObjectId, ref: 'Group', required: true },
  fromUser:     { type: ObjectId, ref: 'User', required: true },
  toUser:       { type: ObjectId, ref: 'User', required: true },
  amount:       { type: Number, required: true },
  sentAt:       { type: Date, default: Date.now },
  nextAllowedAt:{ type: Date, required: true }
}
// Index: { group: 1, fromUser: 1, toUser: 1 }
```

`nextAllowedAt` = `sentAt + 24 hours`. Before creating a new nudge, query this collection for an existing nudge where `(group, fromUser, toUser)` matches and `nextAllowedAt > now`. If found, return `429` with `retryAfter` = `nextAllowedAt`.

### 7. `ExpenseComment`

```js
{
  expense:   { type: ObjectId, ref: 'Expense', required: true, index: true },
  user:      { type: ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
}
```

Only the expense creator (`expense.createdBy`) may post comments. Enforce in the route handler.

---

## How expenses integrate with the Message model

When an expense is created, do the following in a single atomic operation (use a Mongoose session/transaction):

1. Create the `Expense` document.
2. Create `ExpenseSplit` documents for each selected member.
3. Create a `Message` document with:
   - `type: 'spend'`
   - `sender`: the requesting user
   - `group`: the group ID
   - `content`: a human-readable string, e.g. `"Arjun added ₹1,200 for Food — split 3 ways"`
   - `metadata`: `{ expenseId: <expense._id>, amount, category, paidBy, splitCount, splitType }`
4. Update `expense.message` to reference the created message ID.
5. Emit a `new_message` socket event to the group room (same as regular messages) so the expense appears inline in the chat.

When an expense is **edited** within the 10-minute window, update the `Expense` and `ExpenseSplit` documents. Then update the linked `Message.content` and `Message.metadata` to reflect the new values, and emit a `message_updated` socket event.

When an expense is **deleted** within the 10-minute window, soft-delete the `Expense` (`isDeleted: true`), delete all its `ExpenseSplit` documents, and call `message.softDelete()` on the linked message so it disappears from chat history.

---

## Debt simplification algorithm

Run this server-side on every call to `GET /groups/:groupId/balances`. Do not persist the simplified graph — compute it fresh each time.

```
Input: all ExpenseSplit docs for the active cycle (status != 'settled')
     + all BalanceForward docs for the active cycle

Step 1: Build net balance map per user
  For each split:
    net[split.user]        -= split.shareAmount    // this user owes
    net[expense.paidBy]    += split.shareAmount    // payer is owed

  For each balance forward:
    net[bf.fromUser] -= bf.amount
    net[bf.toUser]   += bf.amount

Step 2: Separate into creditors (net > 0) and debtors (net < 0)

Step 3: Greedy reduction
  While creditors and debtors both non-empty:
    C = creditor with largest net (most owed)
    D = debtor with largest |net| (owes most)
    settled = min(net[C], |net[D]|)
    emit: { from: D, to: C, amount: settled }
    net[C] -= settled
    net[D] += settled
    remove C or D if net reaches 0

Output: array of { from, to, amount } — minimum transactions to settle all debts
```

---

## REST API routes to implement

All routes require authentication. All expense routes require the caller to be a member of the group. Routes marked **[creator only]** additionally require `expense.createdBy === req.user._id` AND `new Date() < expense.editableUntil`.

### Expense cycle

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/groups/:groupId/cycles` | List all cycles for the group |
| `GET` | `/api/groups/:groupId/cycles/active` | Get the current active cycle |
| `POST` | `/api/groups/:groupId/cycles` | Start a new cycle (closes current with carry-forward) |

**`POST /api/groups/:groupId/cycles` logic:**
1. Find the active cycle for this group.
2. If one exists, collect all `pending` and `settlement_initiated` splits for that cycle, compute net balances per user pair, create `BalanceForward` docs, then set the cycle `status: 'closed'`, `closedAt: now`, `closeReason: 'new_cycle'`.
3. Create a new active cycle.
4. Return `{ warnings: [{ fromUser, toUser, amount }], newCycle }` so the client can show the carry-forward warning modal before the user confirms.

---

### Expenses

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/groups/:groupId/expenses` | Add an expense |
| `GET` | `/api/groups/:groupId/expenses` | List expenses with filters |
| `GET` | `/api/groups/:groupId/expenses/:expenseId` | Get a single expense with splits |
| `PATCH` | `/api/groups/:groupId/expenses/:expenseId` | Edit expense [creator only, within 10 min] |
| `DELETE` | `/api/groups/:groupId/expenses/:expenseId` | Delete expense [creator only, within 10 min] |

**`POST /api/groups/:groupId/expenses` request body:**
```json
{
  "amount": 1200,
  "category": "Food",
  "note": "Dinner at Toit",
  "imageUrl": "https://...",
  "splitType": "equal",
  "memberIds": ["userId1", "userId2", "userId3"],
  "paidBy": "userId1",
  "customSplits": [
    { "userId": "userId1", "amount": 600 },
    { "userId": "userId2", "amount": 400 },
    { "userId": "userId3", "amount": 200 }
  ]
}
```

**Validation rules:**
- `amount` > 0
- `paidBy` must be a member of the group
- All `memberIds` must be members of the group
- If `splitType === 'custom'`, `customSplits` must be present and `sum(customSplits.amount)` must equal `amount` (within floating point tolerance of 0.01)
- If `splitType === 'equal'`, compute `shareAmount = amount / memberIds.length` — round to 2 decimal places, adjust the last split for rounding remainder

**`GET /api/groups/:groupId/expenses` query params:**
- `cycleId` (default: active cycle)
- `category` (string filter, case-insensitive)
- `paidBy` (userId)
- `from` (ISO date)
- `to` (ISO date)
- `page`, `limit` (default limit: 20)

Response includes paginated expenses with splits populated (user name + share amount).

---

### Balances and summary (Group Info page)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/groups/:groupId/balances` | Simplified debt graph for active cycle |
| `GET` | `/api/groups/:groupId/summary` | Total spend, per-category breakdown, per-member totals |

**`GET /api/groups/:groupId/balances` response:**
```json
{
  "cycleId": "...",
  "currency": "INR",
  "carryForwardIncluded": true,
  "simplifiedDebts": [
    {
      "from": { "_id": "...", "name": "Arjun" },
      "to":   { "_id": "...", "name": "Kavya" },
      "amount": 500
    }
  ]
}
```

**`GET /api/groups/:groupId/summary` response:**
```json
{
  "cycleId": "...",
  "currency": "INR",
  "totalSpend": 4800,
  "byCategory": [
    { "category": "Food",   "total": 2400 },
    { "category": "Drinks", "total": 1200 }
  ],
  "byMember": [
    {
      "user": { "_id": "...", "name": "Arjun" },
      "totalPaid": 2400,
      "totalOwed": 1600
    }
  ]
}
```

---

### Settlements

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/groups/:groupId/settlements` | Initiate a settlement |
| `POST` | `/api/groups/:groupId/settlements/:settlementId/confirm` | Confirm (other party only) |
| `POST` | `/api/groups/:groupId/settlements/:settlementId/cancel` | Cancel (initiator only) |
| `GET` | `/api/groups/:groupId/settlements` | List settlements with status |

**`POST /api/groups/:groupId/settlements` body:**
```json
{ "fromUserId": "...", "toUserId": "...", "amount": 500 }
```

Caller must be either `fromUser` or `toUser`. On creation, set all relevant splits for this user pair in this cycle to `status: 'settlement_initiated'`.

**On `confirm`:** set settlement `status: 'confirmed'`, `confirmedAt: now`. Mark all `settlement_initiated` splits for this pair in this cycle as `status: 'settled'`. The confirming user must be the party that did NOT initiate (i.e. `settlement.initiatedBy !== req.user._id`).

**On `cancel`:** set settlement `status: 'cancelled'`. Revert all `settlement_initiated` splits for this pair back to `status: 'pending'`. Only the initiator can cancel.

After any settlement state change, emit a `settlement_updated` socket event to the group room so the Group Info page can update in real time.

---

### Nudges

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/groups/:groupId/nudge` | Send a payment reminder |

**Request body:** `{ "toUserId": "..." }`

**Validation:**
1. Caller must be a creditor of `toUserId` in the current cycle (verified via the balance graph — `simplifiedDebts` must contain an entry `{ from: toUserId, to: req.user._id }`).
2. Query `Nudge` collection for `{ group, fromUser: req.user._id, toUser: toUserId, nextAllowedAt: { $gt: now } }`. If found, return `429` with `{ retryAfter: nudge.nextAllowedAt }`.
3. If valid, create the `Nudge` document and trigger a push notification to `toUserId` via the existing notification service.

**Notification payload:**
```json
{
  "type": "expense_nudge",
  "title": "Payment reminder",
  "body": "Kavya is reminding you to settle ₹500",
  "data": { "groupId": "...", "fromUserId": "..." }
}
```

---

### Expense comments

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/groups/:groupId/expenses/:expenseId/comments` | Add a comment (expense creator only) |
| `GET` | `/api/groups/:groupId/expenses/:expenseId/comments` | List comments |

---

## Notification events to wire up

Extend the existing notification service with these new event types. Use the existing push notification infrastructure.

| Event | Trigger | Recipients | Payload keys |
|-------|---------|-----------|--------------|
| `expense_nudge` | `POST /nudge` | The debtor (`toUserId`) | `groupId`, `fromUserId`, `amount` |
| `settlement_initiated` | `POST /settlements` | The other party | `groupId`, `settlementId`, `amount`, `initiatedBy` |
| `settlement_confirmed` | `POST /settlements/:id/confirm` | The initiator | `groupId`, `settlementId`, `amount` |
| `settlement_cancelled` | `POST /settlements/:id/cancel` | The other party | `groupId`, `settlementId` |
| `cycle_closed` | `POST /cycles` (new cycle started) | All group members | `groupId`, `oldCycleId`, `newCycleId`, `carryForwardCount` |

---

## Socket events to emit

Use the existing Socket.IO room pattern (`group:<groupId>`).

| Event name | When to emit | Payload |
|------------|-------------|---------|
| `new_message` | Expense created | Full message document (same as regular message) |
| `message_updated` | Expense edited within 10 min | `{ messageId, metadata, content }` |
| `message_deleted` | Expense deleted within 10 min | `{ messageId }` |
| `expense_settled` | Settlement confirmed | `{ groupId, fromUserId, toUserId, amount }` |
| `settlement_updated` | Any settlement state change | `{ settlementId, status }` |

---

## Group Info page — data needed

The Group Info page needs two new endpoints: `GET /balances` and `GET /summary` (both documented above). These power:

- A **"who owes whom"** section showing the simplified debt list. Each row shows debtor name, creditor name, amount, a "Settle" button (visible to both parties), and a "Remind" button (visible only to the creditor).
- A **total group spend** figure for the active cycle.
- A **category breakdown** list.
- A **per-member breakdown** showing how much each person paid vs. how much they owe in total.
- An **expense history list** (powered by `GET /expenses` with filters): filter by category (dropdown), filter by member, paginated. Each row shows date, category badge, amount, who paid, split count.

---

## Error codes to return consistently

| Scenario | HTTP code | Error key |
|----------|-----------|-----------|
| Expense not found | 404 | `EXPENSE_NOT_FOUND` |
| Edit/delete window expired | 403 | `EDIT_WINDOW_EXPIRED` |
| Not expense creator | 403 | `NOT_EXPENSE_CREATOR` |
| Custom splits don't sum to total | 422 | `INVALID_SPLIT_AMOUNTS` |
| Member not in group | 422 | `MEMBER_NOT_IN_GROUP` |
| Nudge rate limit hit | 429 | `NUDGE_RATE_LIMITED` |
| Caller not a creditor | 403 | `NOT_A_CREDITOR` |
| No active cycle | 404 | `NO_ACTIVE_CYCLE` |
| Settlement confirm by wrong party | 403 | `CANNOT_CONFIRM_OWN_SETTLEMENT` |
| Settlement cancel by wrong party | 403 | `ONLY_INITIATOR_CAN_CANCEL` |

---

## Build order recommendation

1. Schemas and model files (`ExpenseCycle`, `Expense`, `ExpenseSplit`, `Settlement`, `BalanceForward`, `Nudge`, `ExpenseComment`)
2. `ExpenseService` — core logic: create expense + splits + message in a transaction, edit, delete, debt simplification algorithm
3. `ExpenseCycleService` — active cycle lookup, new cycle creation with carry-forward, cycle close
4. Expense CRUD routes and middleware (auth, member check, edit window check)
5. `GET /balances` and `GET /summary` routes
6. Settlement routes + socket emission
7. Nudge route + rate limit check + notification
8. Comment routes
9. New notification event handlers in the existing notification service
10. Group Info page endpoints integration test

---

## Architecture notes

All business logic must live in service classes — routes should only handle request parsing, call the service, and return the response. Do not put balance computation or debt simplification logic in route handlers.

Use Mongoose sessions (transactions) wherever multiple documents are created or updated together atomically — specifically: expense creation (Expense + ExpenseSplits + Message), expense deletion (Expense soft-delete + split deletion + message soft-delete), cycle close (cycle update + BalanceForward creation), and settlement confirmation (Settlement update + ExpenseSplit bulk update).
