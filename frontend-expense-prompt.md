# Frontend prompt — wire up the in-chat expense engine

## Context

The backend now exposes an expense management engine that lives inside the existing messaging app. Expenses appear as chat messages of `type: 'spend'` alongside text/image/file messages, and group settlement state is surfaced on the Group Info page. Your job is to build the UI and state wiring so all of this works end-to-end.

The backend is already implemented and deployed — do not modify it. Treat all endpoints below as contract. If a response shape seems off, log a bug, don't patch around it.

**Stack assumptions:** the existing app's framework (React / React Native — match what's already in the repo). Reuse existing conventions for API client, routing, auth, and SSE handling. The backend uses SSE via the existing `sseManager` — there is no Socket.IO.

**Currency:** set once per group per cycle. Render it as a prefix with no space (`₹1,200`, `$45.00`). Pull the symbol from the active cycle's `currency` field and map `INR`→`₹`, `USD`→`$`, etc. via a small util.

---

## 1. REST endpoints you will call

All routes are authenticated and scoped to group members. Base path: `/api/v1/groups/:groupId`.

### Cycles
- `GET /cycles` — list all cycles
- `GET /cycles/active` — current active cycle (`404 NO_ACTIVE_CYCLE` if none)
- `POST /cycles` body `{ currency }` — close current (if any) and start new; returns `{ warnings: [{ fromUser, toUser, amount }], newCycle }`

### Expenses
- `POST /expenses` body `{ amount, category, note, imageUrl, splitType: 'equal'|'custom', memberIds, paidBy, customSplits }`
- `GET /expenses?cycleId=&category=&paidBy=&from=&to=&page=&limit=` — paginated, splits populated
- `GET /expenses/:expenseId`
- `PATCH /expenses/:expenseId` — creator only, within 10 min window
- `DELETE /expenses/:expenseId` — creator only, within 10 min window

### Balances & summary
- `GET /balances` → `{ cycleId, currency, carryForwardIncluded, simplifiedDebts: [{ from:{_id,name}, to:{_id,name}, amount }] }`
- `GET /summary` → `{ cycleId, currency, totalSpend, byCategory:[{category,total}], byMember:[{user,totalPaid,totalOwed}] }`

### Settlements
- `POST /settlements` body `{ fromUserId, toUserId, amount }`
- `POST /settlements/:settlementId/confirm` — only the non-initiator can call
- `POST /settlements/:settlementId/cancel` — only the initiator can call
- `GET /settlements`

### Nudge
- `POST /nudge` body `{ toUserId }` — returns `429` with `{ retryAfter }` if within 24h cooldown

### Comments
- `POST /expenses/:expenseId/comments` body `{ text }` — creator only
- `GET /expenses/:expenseId/comments`

### Error contract

All errors return `{ message, error: <CODE>, ...extra }`. Map these codes to UX:

| Code | Handle as |
|------|-----------|
| `NO_ACTIVE_CYCLE` | Show "Start a new cycle" CTA on Group Info → Expenses tab |
| `EDIT_WINDOW_EXPIRED` | Toast: "This expense can no longer be edited" |
| `NOT_EXPENSE_CREATOR` | Hide edit/delete controls; defensive toast if reached anyway |
| `INVALID_SPLIT_AMOUNTS` | Inline form error on the custom-split row |
| `MEMBER_NOT_IN_GROUP` | Toast: "That user is no longer in the group" |
| `NUDGE_RATE_LIMITED` | Disable nudge button until `retryAfter`; tooltip shows next allowed time |
| `NOT_A_CREDITOR` | Hide nudge button (shouldn't be shown if balance graph was read correctly) |
| `CANNOT_CONFIRM_OWN_SETTLEMENT` | Hide confirm button for initiator |
| `ONLY_INITIATOR_CAN_CANCEL` | Hide cancel button for non-initiator |

---

## 2. SSE events to handle

The app already consumes SSE via the existing manager. Extend the event dispatcher to handle:

| Event | Payload | Action |
|-------|---------|--------|
| `new_message` | full Message doc — if `type === 'spend'`, render the spend bubble inline | Append to chat; update group list last-activity |
| `message_updated` | `{ messageId, metadata, content }` | Patch the matching bubble; re-render |
| `message_deleted` | `{ messageId }` | Remove from chat history |
| `settlement_updated` | `{ settlementId, status }` | Refetch balances + settlements on Group Info |
| `expense_settled` | `{ groupId, fromUserId, toUserId, amount }` | Show a subtle toast "Settled ₹X between A and B"; refetch balances |

Notifications (delivered through the existing notification pipeline) include: `expense_nudge`, `settlement_initiated`, `settlement_confirmed`, `settlement_cancelled`, `cycle_closed`. Route each to the same in-app notification center the rest of the app uses — no new transport.

---

## 3. Screens and components

### 3.1 Spend chat bubble (`type === 'spend'`)

Renders inline in chat, replacing the text bubble for spend messages.

**Content:** the backend already writes `content` like `"Arjun added ₹1,200 for Food — split 3 ways"`. Render it, but also surface a richer card using `metadata`:

```
┌──────────────────────────────────────────┐
│ 🧾  Food · ₹1,200                        │
│ Paid by Arjun · split 3 ways             │
│ [ View details ]                         │
└──────────────────────────────────────────┘
```

- Tap opens the **Expense Detail sheet** (3.5).
- If `createdBy === currentUser` AND `now < createdAt + 10min`, show an inline kebab with Edit / Delete. Use a local countdown that disables them exactly at the 10-min boundary (don't rely on server 403 for the UX gate, but *do* handle 403 as fallback).
- Deleted spend messages should not render at all (server already soft-deletes the `Message`).

### 3.2 Add-expense sheet

Entry points: a "+" button in the chat composer, and an "Add expense" button on the Group Info → Expenses tab.

Fields:
- Amount (numeric input, `> 0`, decimal-aware)
- Category (free text with a chip list of common ones: Food, Drinks, Transport, Stay, Shopping, Other)
- Note (optional, 500 chars)
- Receipt image (optional — reuse the existing image-upload pipeline; set `imageUrl` on the result)
- Paid by (defaults to current user; member picker scoped to group)
- Split type: `equal` | `custom`
  - `equal`: multi-select of group members, preselects all members
  - `custom`: rows of `(member, amount)`; live-compute remainder vs. total, block submit if `|sum − amount| > 0.01`
- Submit → `POST /expenses`

On success, **do nothing UI-side** beyond closing the sheet — the `new_message` SSE event from the server is the source of truth for chat rendering, so don't optimistically insert or you'll double-render.

### 3.3 Group Info → Expenses tab

New tab (or section) on the Group Info page. If `GET /cycles/active` returns 404:
- Show empty state: "No active expense cycle" + `[Start cycle]` CTA → opens a modal that asks for currency (dropdown: INR, USD, EUR, GBP, defaulting to the user's locale) and calls `POST /cycles`.

Otherwise render three blocks from `GET /balances` and `GET /summary`:

**A. Who owes whom** (from `balances.simplifiedDebts`)
```
Arjun  →  Kavya      ₹500    [ Settle ]   [ Remind ]
Rohan  →  Kavya      ₹250    [ Settle ]
```
- `[ Settle ]` visible to both `from` and `to`.
- `[ Remind ]` visible only to the creditor (`to`). If the last nudge's `retryAfter` is in the future (track locally after 429), show `Remind in 14h` disabled.
- If `carryForwardIncluded` is true, show a small "Includes carry-forward from previous cycle" chip above the list.

**B. Summary** (from `GET /summary`)
- Total spend (large number).
- Category breakdown — horizontal bar chart or sorted list with totals.
- Per-member breakdown — each member's `totalPaid` vs. `totalOwed`.

**C. Expense history** (from `GET /expenses` with filters)
- Filter bar: category dropdown (derived from summary.byCategory), paidBy dropdown (members), date range.
- Paginated list. Each row: date · category badge · amount · "paid by X" · split-count.
- Tap → Expense Detail sheet.

**Cycle actions** (top-right of the tab): `[ Start new cycle ]`. Tapping calls `POST /cycles` with the current currency; if `warnings.length > 0`, show a carry-forward confirmation modal **before** firing the request — the client must display the warnings modal first by doing a dry-run computation, OR fire the request and show the warnings response to the user after the fact. Spec option chosen by backend: the backend closes the cycle and returns warnings; the correct UX is:

> 1. Show a confirmation modal "Starting a new cycle will close the current one. Outstanding balances will carry forward." with a `[Continue]` button.
> 2. On continue, call `POST /cycles`. Show the returned `warnings` as a read-only list on the success screen: "The following balances were carried forward to the new cycle."

### 3.4 Settle flow

`[ Settle ]` on a debt row → modal:
```
Settle ₹500 between Arjun and Kavya
[Cancel]  [Confirm settlement]
```
- If current user is the debtor (`from`), call `POST /settlements` with `{ fromUserId: me, toUserId: counterparty, amount }`.
- Same on the creditor side.
- On success, the modal swaps to "Waiting for <other party> to confirm…" with a `[Cancel]` button (calls `/cancel`).
- For the **other party**, the `settlement_initiated` notification should deep-link to the same modal, now showing `[Confirm]` and `[Reject]` (reject = not an API, just dismiss; only the initiator can cancel server-side).
- Handle `settlement_updated` SSE to live-sync state.

### 3.5 Expense detail sheet

Opened from a spend bubble or history row. Shows:
- Amount, category, note, receipt image (if any), paid by, split type
- Per-member share list with settled/pending/settlement-initiated status chips
- Edit / Delete buttons (creator + within 10 min)
- Comments section:
  - List of comments (`GET /comments`). Show commenter name + text + timestamp.
  - If current user is the creator, show a comment input. Otherwise show "Only the expense creator can comment."

### 3.6 Nudge button

On a debt row where current user is the creditor:
- `POST /nudge` with `{ toUserId }` on click
- On 201: toast "Reminder sent to <name>", then disable for 24h (persist `retryAfter` locally keyed by `(groupId, toUserId)`)
- On 429: read `retryAfter`, disable until then, tooltip "You can remind them again in Xh Ym"

The debtor receives a push notification via the existing notification service — nothing to build for the receiving side beyond ensuring `expense_nudge` type routes to the notification center with a "Pay now" deep link to the relevant debt row.

---

## 4. State & data flow

Use whatever query/caching layer the app already uses (React Query, SWR, Redux RTK Query — match it). Suggested cache keys:

- `['group', groupId, 'cycles', 'active']`
- `['group', groupId, 'balances']`
- `['group', groupId, 'summary']`
- `['group', groupId, 'expenses', filters]`
- `['group', groupId, 'settlements']`
- `['expense', expenseId, 'comments']`

**Invalidation rules:**
- After `new_message` where `type === 'spend'` → invalidate balances, summary, expenses list.
- After `message_updated` for a spend message → same.
- After `message_deleted` for a spend message → same.
- After `settlement_updated` or `expense_settled` → invalidate balances, settlements.
- After `POST /cycles` → invalidate everything under `['group', groupId, ...]`.

Optimistic updates are discouraged for expense creation (SSE already round-trips quickly). Optimistically updating balances locally is fine; reconcile on refetch.

---

## 5. Validation rules to enforce client-side

Mirror the server's rules so users see immediate feedback:

- `amount` must parse to a number > 0
- If `splitType === 'custom'`, sum of `customSplits[].amount` must equal `amount` within 0.01 tolerance
- If `splitType === 'equal'`, must select at least one member
- `paidBy` must be one of the group members (dropdown constrains this)
- Category is required, trim + max 50 chars
- Note max 500 chars

All server 422s should still be surfaced in case of drift.

---

## 6. Acceptance criteria

- Creating an expense posts a spend bubble inline in the chat within ~200ms (via SSE).
- Editing/deleting within 10 minutes updates/removes the bubble for all members live.
- The Group Info → Expenses tab reflects the simplified debt graph and updates live when settlements confirm.
- Nudge button honours the 24h cooldown without a full page reload.
- Settlement flow works end-to-end for both initiator and counterparty, including cancel and reject.
- Starting a new cycle shows carry-forward warnings and the new cycle immediately reflects the carried balances.
- All listed error codes map to the user-facing text above.

---

## 7. Out of scope

- No changes to the message model, group model, auth, or the existing chat composer's non-spend flows.
- No offline queueing for expense creation — require network.
- No export/receipts PDF generation in this pass.

Build the above, wire the SSE handlers, and verify with two accounts in a shared group: create → edit → settle → nudge → close cycle.
