# Guest Checkout & Authenticated User Flow Documentation

## Overview

This document describes the complete flow for guest checkout and authenticated user checkout in Zephyr Techno. Both flows follow the same API endpoints but handle user identification differently.

---

## Table of Contents

1. [Guest User Flow](#guest-user-flow)
2. [Authenticated User Flow](#authenticated-user-flow)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Request/Response Examples](#requestresponse-examples)
5. [Key Differences](#key-differences)

---

## Guest User Flow

### Overview
A guest user can browse, add products to cart, and checkout without creating an account. All operations are tracked using a unique `guestSessionId`.

### Step-by-Step Flow

#### 1. **Initialize Guest Session**

**What Happens:**
- Frontend generates a unique UUID (`guestSessionId`)
- Stores it in browser's localStorage or sessionStorage
- Uses this ID for all subsequent requests

**No API Call Required** - This is purely frontend logic

```javascript
// Frontend pseudo-code
const guestSessionId = generateUUID(); // e.g., "550e8400-e29b-41d4-a716-446655440000"
localStorage.setItem('guestSessionId', guestSessionId);
```

---

#### 2. **Add Product to Cart**

**API:** `POST /api/cart`

**Request:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "productId": "prod-123",
  "colorId": "color-red",
  "storageOptionId": "storage-256gb",
  "ramOptionId": "ram-12gb",
  "quantity": 1
}
```

**Backend Processing:**
1. Validates `guestSessionId` is provided
2. Finds or creates `Cart` with `sessionId = guestSessionId` (no `userId`)
3. Validates product exists and is active
4. Checks stock availability
5. Checks if this exact configuration already in cart
   - If YES: Increase quantity
   - If NO: Create new CartItem
6. Returns formatted cart item

**Response:**
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "id": "item-456",
    "productId": "prod-123",
    "title": "iPhone 14 Pro",
    "quantity": 1,
    "price": 999.99,
    "total": 999.99,
    "selectedOptions": {
      "color": "Red",
      "storage": "256GB",
      "ram": "12GB"
    }
  }
}
```

**Database Changes:**
- `Cart` created with `sessionId` (userId = null)
- `CartItem` created linking to this cart

---

#### 3. **View Cart**

**API:** `GET /api/cart?guestSessionId=550e8400-e29b-41d4-a716-446655440000`

**Request:**
- Query parameter: `guestSessionId`
- No authentication header needed

**Backend Processing:**
1. Finds `Cart` by `sessionId = guestSessionId`
2. Fetches all active CartItems
3. Calculates subtotal and total items

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "item-456",
        "productId": "prod-123",
        "title": "iPhone 14 Pro",
        "quantity": 1,
        "price": 999.99,
        "total": 999.99,
        "selectedOptions": {
          "color": "Red",
          "storage": "256GB",
          "ram": "12GB"
        }
      },
      {
        "id": "item-789",
        "productId": "prod-456",
        "title": "Samsung S26 Ultra",
        "quantity": 2,
        "price": 1199.99,
        "total": 2399.98,
        "selectedOptions": {
          "color": "Blue",
          "storage": "512GB",
          "ram": "16GB"
        }
      }
    ],
    "subtotal": 3399.97,
    "totalItems": 2
  }
}
```

---

#### 4. **Update Cart Item Quantity**

**API:** `PATCH /api/cart/:cartItemId`

**Request:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 3
}
```

**Backend Processing:**
1. Finds CartItem by ID
2. Verifies it belongs to cart with matching `sessionId`
3. Checks new quantity against stock
4. Updates quantity
5. Returns updated item

**Response:**
```json
{
  "success": true,
  "message": "Cart item updated",
  "data": {
    "id": "item-456",
    "productId": "prod-123",
    "title": "iPhone 14 Pro",
    "quantity": 3,
    "price": 999.99,
    "total": 2999.97
  }
}
```

---

#### 5. **Remove Item from Cart**

**API:** `DELETE /api/cart/:cartItemId`

**Request:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Backend Processing:**
1. Finds CartItem by ID
2. Verifies ownership (cart.sessionId matches guestSessionId)
3. Deletes CartItem

**Response:**
```json
{
  "success": true,
  "message": "Item removed from cart"
}
```

---

#### 6. **Clear Entire Cart**

**API:** `DELETE /api/cart`

**Request:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Backend Processing:**
1. Finds Cart by sessionId
2. Deletes all CartItems from this cart

**Response:**
```json
{
  "success": true,
  "message": "Cart cleared"
}
```

---

#### 7. **Checkout from Cart** ⭐ **MAIN PURCHASE**

**API:** `POST /api/public/product/checkout`

**Request:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "guestEmail": "guest@example.com",
  "cartItemIds": [],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+1-202-555-0118",
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94103",
    "country": "US"
  },
  "shippingMethod": "Standard Delivery",
  "shippingCost": 0,
  "promoCode": "SUMMER25"
}
```

**Required Fields:**
- `guestSessionId`: Guest's session identifier
- `guestEmail`: Email for order tracking and confirmation
- `shippingAddress`: Complete delivery address

**Optional Fields:**
- `cartItemIds`: Specific items to checkout (empty = all items)
- `shippingMethod`: e.g., "Standard Delivery", "Express Delivery"
- `shippingCost`: Shipping charges (default: 0)
- `promoCode`: Discount code to apply

**Backend Processing (Transaction):**

1. **Validate Inputs:**
   - Verify guestSessionId is provided
   - Verify guestEmail is provided
   - Verify shippingAddress is complete

2. **Find Cart:**
   - Query: `Cart` where `sessionId = guestSessionId`
   - If not found: Return error "Cart is empty"

3. **Fetch Cart Items:**
   - Get all CartItems from this cart (or specific ones if cartItemIds provided)
   - If none found: Return error "No items to checkout"

4. **Validate Stock:**
   - Check each product has sufficient stock
   - Check each product is ACTIVE
   - Return error if any validation fails

5. **Create Shipping Address:**
   - Insert `UserAddress` with `userId = null` (guest order)
   - Store all address details

6. **Create Order:**
   - Generate unique `stringId` (e.g., "ORD-ABC123")
   - Insert `Order` with:
     - `userId = null` (guest order)
     - `guestEmail` = provided email
     - `addressId` = created address
     - `totalPrice` = calculated total
     - `orderStatus = PENDING`
     - `paymentStatus = PENDING`

7. **Create Order Items:**
   - For each CartItem, create `OrderItem` with product details

8. **Deduct Stock:**
   - For each product, decrement `stockQuantity`

9. **Apply Promo Code (if provided):**
   - Validate promo code exists and is active
   - Calculate discount
   - Increment usage count

10. **Clear Cart:**
    - Delete all CartItems from this cart

11. **Create Stripe Session:**
    - Build line items from order
    - Create Stripe checkout session
    - Generate payment URL

12. **Return Response**

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order-789",
    "orderNumber": "ORD-ABC123",
    "totalPrice": 3399.97,
    "shippingCost": 0,
    "discountTotal": 99.99,
    "guestEmail": "guest@example.com",
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_...",
    "sessionId": "cs_test_123456"
  }
}
```

**Important:**
- Order status is PENDING (not yet paid)
- Cart items are cleared from cart (but order items created)
- Guest can check order status using `guestEmail` + `orderId`

---

#### 8. **Confirm Payment After Stripe Success**

**API:** `POST /api/public/product/checkout/confirm`

**Request:**
```json
{
  "sessionId": "cs_test_123456"
}
```

**Backend Processing:**
1. Retrieve Stripe session using `sessionId`
2. Check `payment_status = 'paid'`
3. Extract `orderId` from session metadata
4. Update Order:
   - `orderStatus = PROCESSING`
   - `paymentStatus = PAID`
5. Return updated order

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order-789",
    "orderId": "ORD-ABC123",
    "orderStatus": "PROCESSING",
    "paymentStatus": "PAID",
    "totalPrice": 3399.97,
    "shippingMethod": "Standard Delivery",
    "orderItems": [
      {
        "productId": "prod-123",
        "title": "iPhone 14 Pro",
        "quantity": 1,
        "priceAtPurchase": 999.99
      }
    ],
    "shippingAddress": {
      "fullName": "John Doe",
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zipCode": "94103",
      "country": "US"
    },
    "createdAt": "2026-05-21T10:30:00Z"
  }
}
```

---

## Authenticated User Flow

### Overview
An authenticated user has a registered account. They follow similar steps but are identified by their JWT token (`userId`).

### Step-by-Step Flow

#### 1. **Login (Get JWT Token)**

**API:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Optional Parameters:**
- `guestSessionId`: If the user had added items as a guest, provide this to migrate their cart

**Backend Processing:**
1. Validate email and password
2. Check email is verified and account is active
3. Generate JWT token with userId
4. **Cart Migration:** If `guestSessionId` provided:
   - Find guest cart by `sessionId`
   - Find or create authenticated user's cart
   - Merge guest items into user's cart:
     - If same product already in user cart → Add guest quantity to it
     - If new product → Add it to user's cart
   - Delete the guest cart
5. Return JWT token and user info

**Important:**
- Guest cart items are automatically merged into user's cart during login
- If both guest and user have the same product, quantities are combined
- Guest session is cleared after migration

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CUSTOMER"
  }
}
```

**Frontend:** Store `accessToken` in localStorage/sessionStorage

---

#### 2. **Add Product to Cart**

**API:** `POST /api/cart`

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

**Request Body:**
```json
{
  "productId": "prod-123",
  "colorId": "color-red",
  "storageOptionId": "storage-256gb",
  "ramOptionId": "ram-12gb",
  "quantity": 1
}
```

**Key Difference from Guest:**
- NO `guestSessionId` needed
- Authorization header provides `userId` via JWT token
- Backend extracts `userId` from token

**Backend Processing:**
1. Extract `userId` from JWT token
2. Find or create `Cart` with `userId` (sessionId = null)
3. Validate product, check stock
4. Create or update CartItem
5. Return cart item

**Response:** (Same structure as guest)

---

#### 3. **View Cart**

**API:** `GET /api/cart`

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Key Difference:**
- No `guestSessionId` query parameter
- `userId` comes from token

**Backend Processing:**
1. Extract `userId` from token
2. Find `Cart` by `userId`
3. Return cart items

**Response:** (Same structure)

---

#### 4. **Update Cart Item**

**API:** `PATCH /api/cart/:cartItemId`

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

**Request Body:**
```json
{
  "quantity": 3
}
```

**Backend Processing:**
1. Extract `userId` from token
2. Verify CartItem belongs to user's cart
3. Update quantity
4. Return updated item

---

#### 5. **Checkout from Cart** ⭐ **MAIN PURCHASE**

**API:** `POST /api/public/product/checkout`

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

**Request Body:**
```json
{
  "cartItemIds": [],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+1-202-555-0118",
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94103",
    "country": "US"
  },
  "shippingMethod": "Standard Delivery",
  "shippingCost": 0,
  "promoCode": "SUMMER25"
}
```

**Key Differences:**
- NO `guestSessionId` - userId from token
- NO `guestEmail` - email from user's account
- Cart lookup by `userId` instead of `sessionId`

**Backend Processing:** (Same as guest, but with userId)

1. Extract `userId` from token
2. Find Cart by `userId`
3. Fetch CartItems
4. Create UserAddress with `userId` (not null)
5. Create Order with `userId` (not null), no `guestEmail`
6. Create OrderItems
7. Deduct stock
8. Apply promo code
9. Clear cart items
10. Create Stripe session
11. Return response

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order-789",
    "orderNumber": "ORD-XYZ789",
    "totalPrice": 3399.97,
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_...",
    "sessionId": "cs_test_123456"
  }
}
```

---

#### 6. **Confirm Payment**

**API:** `POST /api/public/product/checkout/confirm`

**Request:**
```json
{
  "sessionId": "cs_test_123456"
}
```

**Backend Processing:** (Same for both guest and authenticated)

**Response:** (Same structure)

---

#### 7. **View Order History** (Authenticated Only)

**API:** `GET /api/orders?page=1&limit=20&status=PENDING`

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `status`: Filter by status (PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED)

**Backend Processing:**
1. Extract `userId` from token
2. Fetch all orders where `userId` matches
3. Apply status filter if provided
4. Return paginated results

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "order-789",
      "orderId": "ORD-XYZ789",
      "orderStatus": "PROCESSING",
      "totalPrice": 3399.97,
      "paymentStatus": "PAID",
      "createdAt": "2026-05-21T10:30:00Z",
      "orderItems": [...]
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

## API Endpoints Reference

### Guest Endpoints (No Authentication)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cart` | Add product to cart (guestSessionId in body) |
| GET | `/api/cart?guestSessionId=...` | View cart (guestSessionId in query) |
| PATCH | `/api/cart/:id` | Update item quantity (guestSessionId in body) |
| DELETE | `/api/cart/:id` | Remove item (guestSessionId in body) |
| DELETE | `/api/cart` | Clear cart (guestSessionId in body) |
| POST | `/api/public/product/checkout` | Create checkout (guestSessionId + guestEmail in body) |
| POST | `/api/public/product/checkout/confirm` | Confirm payment (sessionId in body) |

### Authenticated Endpoints (Requires JWT Token)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cart` | Add product to cart (no guestSessionId) |
| GET | `/api/cart` | View cart (no guestSessionId) |
| PATCH | `/api/cart/:id` | Update item quantity (no guestSessionId) |
| DELETE | `/api/cart/:id` | Remove item (no guestSessionId) |
| DELETE | `/api/cart` | Clear cart (no guestSessionId) |
| POST | `/api/public/product/checkout` | Create checkout (no guestSessionId/Email, use token) |
| POST | `/api/public/product/checkout/confirm` | Confirm payment (sessionId in body) |
| GET | `/api/orders` | View order history (authenticated users only) |
| POST | `/api/orders/:id/cancel` | Cancel order (authenticated users only) |

---

## Request/Response Examples

### Example 1: Complete Guest Checkout Flow

**Step 1: Add to Cart**
```
POST /api/cart
Body: {
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "productId": "prod-123",
  "colorId": "color-red",
  "storageOptionId": "storage-256gb",
  "ramOptionId": "ram-12gb",
  "quantity": 1
}
Response: { "success": true, "data": { "id": "item-1", ... } }
```

**Step 2: View Cart**
```
GET /api/cart?guestSessionId=550e8400-e29b-41d4-a716-446655440000
Response: { "success": true, "data": { "items": [...], "subtotal": 999.99, "totalItems": 1 } }
```

**Step 3: Checkout**
```
POST /api/public/product/checkout
Body: {
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "guestEmail": "guest@example.com",
  "cartItemIds": [],
  "shippingAddress": { ... },
  "shippingCost": 0
}
Response: { "success": true, "data": { "checkoutUrl": "https://...", "sessionId": "cs_..." } }
```

**Step 4: Confirm Payment**
```
POST /api/public/product/checkout/confirm
Body: { "sessionId": "cs_..." }
Response: { "success": true, "data": { "orderStatus": "PROCESSING", "paymentStatus": "PAID" } }
```

---

### Example 2: Complete Authenticated User Checkout Flow

**Step 1: Login**
```
POST /api/auth/login
Body: { "email": "user@example.com", "password": "Pass123!" }
Response: { "success": true, "accessToken": "eyJ...", "user": {...} }
```

**Step 2: Add to Cart**
```
POST /api/cart
Header: Authorization: Bearer eyJ...
Body: { "productId": "prod-123", "colorId": "color-red", ... }
Response: { "success": true, "data": { "id": "item-1", ... } }
```

**Step 3: View Cart**
```
GET /api/cart
Header: Authorization: Bearer eyJ...
Response: { "success": true, "data": { "items": [...], "subtotal": 999.99 } }
```

**Step 4: Checkout**
```
POST /api/public/product/checkout
Header: Authorization: Bearer eyJ...
Body: { "cartItemIds": [], "shippingAddress": {...}, "shippingCost": 0 }
Response: { "success": true, "data": { "checkoutUrl": "https://...", "sessionId": "cs_..." } }
```

**Step 5: Confirm Payment**
```
POST /api/public/product/checkout/confirm
Body: { "sessionId": "cs_..." }
Response: { "success": true, "data": { "orderStatus": "PROCESSING" } }
```

**Step 6: View Order History**
```
GET /api/orders?page=1&limit=20
Header: Authorization: Bearer eyJ...
Response: { "success": true, "data": [...], "meta": {...} }
```

---

## Key Differences

| Feature | Guest User | Authenticated User |
|---------|-----------|-------------------|
| **Identification** | `guestSessionId` (UUID) | `userId` (from JWT token) |
| **Cart Lookup** | `Cart.sessionId` | `Cart.userId` |
| **Order Tracking** | `guestEmail` + `orderId` | `userId` |
| **Auth Header** | Not required | Required |
| **Email** | Provided at checkout | From user account |
| **Address** | `UserAddress.userId = null` | `UserAddress.userId = user's id` |
| **Order History** | Not available | Available via `/api/orders` |
| **Session Persistence** | Browser storage | JWT token |
| **Cart Persistence** | SessionId-based | UserId-based |

---

## Cart Migration (Guest → Authenticated)

### Overview
When a guest user logs in, their cart items are automatically migrated to their authenticated user account.

### Migration Flow

**Scenario:**
1. Guest adds items to cart (with `guestSessionId`)
2. Guest decides to create account and logs in
3. Items are automatically migrated

**Process:**

**Step 1: Frontend - Send guestSessionId with Login Request**
```javascript
// Frontend stores guestSessionId from earlier guest session
const guestSessionId = localStorage.getItem('guestSessionId');

// Send with login request
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "Password123!",
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Step 2: Backend - Authenticate User**
1. Validate email and password
2. Generate JWT token with userId
3. Proceed to Step 3

**Step 3: Backend - Migrate Guest Cart**
1. Find guest cart by `sessionId = guestSessionId`
2. If guest cart doesn't exist → Skip migration (nothing to migrate)
3. Find or create authenticated user's cart by `userId`
4. **Merge items:**
   - For each guest cart item:
     - If same product (with same color, storage, RAM) exists in user's cart:
       - **Combine quantities:** `user_qty + guest_qty`
       - Check stock availability for combined quantity
       - Update user's cart item with new quantity
     - If product is new (not in user's cart):
       - Add guest item to user's cart with same quantity
5. Delete the guest cart (cascade deletes all guest items)
6. Return response

**Step 4: Frontend - Clear Guest Session**
```javascript
// After successful login, clear guest session ID
localStorage.removeItem('guestSessionId');

// Now use authenticated cart with Authorization header
// Authorization: Bearer {{accessToken}}
```

### Migration Examples

#### Example 1: No Duplicates
**Guest Cart:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 2

**User Cart:** (empty)

**After Migration:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 2

---

#### Example 2: With Duplicates
**Guest Cart:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 2
- Item 2: Samsung S25 (Blue, 512GB) - Qty: 1

**User Cart (already has):**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 3
- Item 3: MacBook Air (Silver, 256GB) - Qty: 1

**After Migration:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 5 (3 + 2)
- Item 2: Samsung S25 (Blue, 512GB) - Qty: 1 (new)
- Item 3: MacBook Air (Silver, 256GB) - Qty: 1 (unchanged)

---

#### Example 3: Stock Conflict
**Guest Cart:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 5

**User Cart:**
- Item 1: iPhone 14 Pro (Red, 256GB, 12GB) - Qty: 6

**Stock Available:** 9 total

**Result:**
- Combined quantity would be 11, but only 9 in stock
- Guest item is **not merged** (stock unavailable)
- User's cart quantity remains 6
- Guest quantity is ignored to prevent overselling

---

### Important Notes

1. **Automatic Process:** No additional API calls needed - migration happens during login
2. **Non-Blocking:** If migration fails, login still succeeds (migration is a nice-to-have feature)
3. **Stock Check:** If merged quantity exceeds stock, guest items won't be added
4. **Session Cleanup:** Frontend should clear `guestSessionId` from localStorage after successful login
5. **Same-Day Purchase:** Guest can add to cart, login, and checkout all in one session with their items preserved

---

## Database Relations

### Guest Cart
```
Cart (sessionId = UUID, userId = null)
  ├─ CartItems
  └─ Order (userId = null, guestEmail = provided)
     ├─ UserAddress (userId = null)
     └─ OrderItems
```

### Authenticated User Cart
```
Cart (userId = user's id, sessionId = null)
  ├─ CartItems
  └─ Order (userId = user's id, guestEmail = null)
     ├─ UserAddress (userId = user's id)
     └─ OrderItems
```

---

## Error Handling

### Common Error Responses

**Missing guestSessionId (Guest)**
```json
{
  "success": false,
  "message": "Either login or provide guestSessionId"
}
```

**Invalid Authorization (Authenticated)**
```json
{
  "success": false,
  "message": "Unauthorized: Invalid token"
}
```

**Product Out of Stock**
```json
{
  "success": false,
  "message": "Only 5 items in stock"
}
```

**Cart Empty at Checkout**
```json
{
  "success": false,
  "message": "Cart is empty"
}
```

**Invalid Promo Code**
```json
{
  "success": false,
  "message": "Promo code has expired"
}
```

---

## Security Considerations

1. **Guest Sessions:** `guestSessionId` is UUID but can be brute-forced; add rate limiting
2. **Cart Ownership:** Always verify `sessionId` matches guest before modifications
3. **User Authorization:** Check `userId` from token matches cart owner
4. **Soft Deletes:** Deleted carts/items retain `isDeleted` flag, not permanently removed
5. **Stock Deduction:** Done in transaction to prevent race conditions
6. **Payment Verification:** Always verify Stripe payment status before confirming

---

## Summary

- **Guest users** shop without registration using a `guestSessionId` UUID
- **Authenticated users** use JWT tokens to identify themselves
- Both flows use identical API endpoints but with different authentication methods
- Guest orders are tracked by `guestEmail` + `orderId`
- Authenticated user orders are tracked by `userId`
- Cart data is session-specific (guests) or user-specific (authenticated)
- All checkout operations are transactional for data consistency
