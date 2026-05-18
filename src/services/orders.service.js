import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";
import promoService from "./promo.service.js";

/**
 * OrderService
 * Handles order creation and management
 */
class OrderService {
  /**
   * Create order from cart (checkout)
   * Converts cart items to order items with price snapshot
   * @param {string} userId - User ID
   * @param {Object} data - { shippingAddress, paymentMethod, cartItemIds?, shippingMethod?, shippingCost?, promoCode? }
   * @param {string[]} data.cartItemIds - Optional: specific cart item IDs to checkout. If omitted, checkout all cart items.
   * @param {Object} data.shippingAddress - { fullName, phone?, street, city, state?, zipCode, country }
   * @param {string} data.shippingMethod - Optional: e.g., "Standard Delivery", "Express Delivery"
   * @param {number} data.shippingCost - Optional: shipping cost (default 0)
   * @param {string} data.promoCode - Optional: promo code to apply
   */
  async createOrder(userId, data) {
    const { shippingAddress, paymentMethod, cartItemIds, shippingMethod, shippingCost = 0, promoCode } = data;

    if (!shippingAddress) {
      throw new AppError("Shipping address is required", 400);
    }

    // Validate required address fields
    const { fullName, street, city, zipCode, country } = shippingAddress;
    if (!fullName || !street || !city || !zipCode || !country) {
      throw new AppError("Complete shipping address required (fullName, street, city, zipCode, country)", 400);
    }

    // Get user's cart items
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      throw new AppError('Cart is empty', 400);
    }

    // Build where clause: if cartItemIds provided, filter by them; otherwise get all
    const whereClause = { cartId: cart.id };
    if (cartItemIds && cartItemIds.length > 0) {
      whereClause.id = { in: cartItemIds };
    }

    const cartItems = await prisma.cartItem.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            basePrice: true,
            stockQuantity: true,
            listingStatus: true,
            seriesId: true,
            deviceModelId: true,
          },
        },
        color: { select: { id: true, name: true } },
        storageOption: { select: { id: true, name: true } },
        ramOption: { select: { id: true, name: true } },
      },
    });

    if (cartItems.length === 0) {
      throw new AppError("No items to checkout", 400);
    }

    // If specific cartItemIds were requested, verify all were found
    if (cartItemIds && cartItemIds.length > 0 && cartItems.length !== cartItemIds.length) {
      throw new AppError('Some cart items not found or do not belong to your cart', 400);
    }

    // Validate stock availability for all items
    for (const item of cartItems) {
      if (item.product.listingStatus !== "ACTIVE") {
        throw new AppError(
          `Product "${item.product.title}" is no longer available`,
          400,
        );
      }

      if (item.product.stockQuantity < item.quantity) {
        throw new AppError(
          `Insufficient stock for "${item.product.title}". Only ${item.product.stockQuantity} available.`,
          400,
        );
      }
    }

    // Calculate order total
    const orderTotal = cartItems.reduce(
      (sum, item) => sum + item.product.basePrice * item.quantity,
      0,
    );

    // Validate and apply promo code if provided
    let discountTotal = 0;
    let promoCodeId = null;
    let appliedPromoCode = null;

    if (promoCode) {
      const promoResult = await promoService.validateAndApplyPromoCode(promoCode, cartItems, orderTotal);
      if (!promoResult.valid) {
        throw new AppError(promoResult.message, 400);
      }
      discountTotal = promoResult.discount;
      promoCodeId = promoResult.promoCode.id;
      appliedPromoCode = promoResult.promoCode.code;
    }

    // Final total: orderTotal + shippingCost - discountTotal
    const finalTotal = orderTotal + shippingCost - discountTotal;

    if (finalTotal < 0) {
      throw new AppError('Invalid order total', 400);
    }

    // Create order and order items in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create shipping address
      const address = await tx.userAddress.create({
        data: {
          userId,
          fullName: shippingAddress.fullName,
          phone: shippingAddress.phone || null,
          street: shippingAddress.street,
          city: shippingAddress.city,
          state: shippingAddress.state || null,
          zipCode: shippingAddress.zipCode,
          country: shippingAddress.country,
        },
      });

      // Generate unique string ID for order (e.g., ORD-20260517-ABC123)
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      const stringId = `ORD-${timestamp}-${random}`;

      // Create order
      const createdOrder = await tx.order.create({
        data: {
          userId,
          stringId,
          addressId: address.id,
          totalPrice: finalTotal,
          shippingCost,
          shippingMethod: shippingMethod || null,
          discountTotal,
          promoCodeUsed: appliedPromoCode,
          orderStatus: "PENDING",
          paymentMethod: paymentMethod || "STRIPE",
          orderItems: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              colorId: item.colorId,
              storageOptionId: item.storageOptionId,
              ramOptionId: item.ramOptionId,
              quantity: item.quantity,
              priceAtPurchase: item.product.basePrice,
            })),
          },
        },
        select: {
          id: true,
          stringId: true,
          userId: true,
          totalPrice: true,
          shippingCost: true,
          shippingMethod: true,
          discountTotal: true,
          promoCodeUsed: true,
          orderStatus: true,
          paymentStatus: true,
          paymentMethod: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Batch stock updates - collect all product IDs and quantities
      const stockUpdates = cartItems.map((item) =>
        tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        })
      );

      // Execute all stock updates in parallel
      await Promise.all(stockUpdates);

      // Clear only the checked-out items
      const cartItemIdsToDelete = cartItems.map((item) => item.id);
      await tx.cartItem.deleteMany({ where: { id: { in: cartItemIdsToDelete } } });

      // Increment promo code usage count if applied
      if (promoCodeId) {
        await tx.promoCode.update({
          where: { id: promoCodeId },
          data: { currentUsageCount: { increment: 1 } },
        });
      }

      return { order: createdOrder, address, cartItems };
    });

    // Format order response using data from transaction
    return {
      id: order.order.id,
      orderId: order.order.stringId,
      totalPrice: parseFloat(order.order.totalPrice),
      shippingCost: parseFloat(order.order.shippingCost),
      shippingMethod: order.order.shippingMethod,
      discountTotal: parseFloat(order.order.discountTotal),
      status: order.order.orderStatus,
      paymentStatus: order.order.paymentStatus,
      paymentMethod: order.order.paymentMethod,
      shippingAddress: {
        fullName: order.address.fullName,
        phone: order.address.phone,
        street: order.address.street,
        city: order.address.city,
        state: order.address.state,
        zipCode: order.address.zipCode,
        country: order.address.country,
      },
      items: order.cartItems.map((item) => ({
        productId: item.productId,
        title: item.product.title,
        quantity: item.quantity,
        priceAtPurchase: parseFloat(item.product.basePrice),
        subtotal: parseFloat(item.product.basePrice) * item.quantity,
      })),
      createdAt: order.order.createdAt,
      updatedAt: order.order.updatedAt,
    };
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId, query = {}) {
    const { status, page = 1, limit = 50 } = query;

    const where = { userId, isDeleted: false };
    if (status) where.orderStatus = status;

    const take = Math.min(Number(limit) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Run count and findMany in parallel
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          address: {
            select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
          },
          orderItems: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  productGalleries: {
                    select: { imageUrl: true },
                    orderBy: { displayOrder: 'asc' },
                    take: 1,
                  },
                },
              },
              color: { select: { id: true, name: true } },
              storageOption: { select: { id: true, name: true } },
              ramOption: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return { total, data: orders.map((order) => this.#formatOrder(order)) };
  }

  /**
   * Get order by ID (with authorization check)
   */
  async getOrderById(orderId, userId, isAdmin = false) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        stringId: true,
        userId: true,
        orderStatus: true,
        totalPrice: true,
        shippingCost: true,
        shippingMethod: true,
        discountTotal: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentIntentId: true,
        trackingNumber: true,
        cancellationReason: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        address: {
          select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productGalleries: {
                  select: { imageUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    // Authorization: user can only view their own orders, admin can view all
    if (!isAdmin && order.userId !== userId) {
      throw new AppError("Unauthorized to view this order", 403);
    }

    return this.#formatOrder(order, isAdmin);
  }

  /**
   * Cancel an order by user with reason
   */
  async cancelOrderByUser(orderId, userId, reason) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('Order not found', 404);

    // Only owner can cancel
    if (order.userId !== userId) throw new AppError('Unauthorized to cancel this order', 403);

    // Prevent cancelling already shipped/delivered/cancelled orders
    if (['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(order.orderStatus)) {
      throw new AppError('Order cannot be cancelled at this stage', 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: 'CANCELLED',
        cancellationReason: reason || null,
        cancelledAt: new Date(),
      },
      include: {
        address: {
          select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
        },
        user: { select: { id: true, email: true } },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productGalleries: { select: { imageUrl: true }, orderBy: { displayOrder: 'asc' }, take: 1 },
              },
            },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.#formatOrder(updated, true);
  }

  /**
   * Update order status (Admin only)
   */
  async updateOrderStatus(orderId, status) {
    const validStatuses = [
      "PENDING",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        400,
      );
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: status },
      include: {
        address: {
          select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productGalleries: {
                  select: { imageUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.#formatOrder(order, true);
  }

  /**
   * Update order and payment status (for payment confirmation)
   */
  async confirmPayment(orderId, orderStatus = 'PROCESSING', paymentStatus = 'PAID') {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { 
        orderStatus,
        paymentStatus,
      },
      include: {
        address: {
          select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productGalleries: {
                  select: { imageUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.#formatOrder(order, true);
  }

  /**
   * Get all orders (Admin only)
   */
  async getAllOrders(query) {
    const { status, userId } = query;

    const where = { isDeleted: false };
    if (status) where.orderStatus = status;
    if (userId) where.userId = userId;

    const orders = await prisma.order.findMany({
      where,
      include: {
        address: {
          select: { fullName: true, phone: true, street: true, city: true, state: true, zipCode: true, country: true },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productGalleries: {
                  select: { imageUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return orders.map((order) => this.#formatOrder(order, true));
  }

  /**
   * Get order statistics overview (Admin only)
   */
  async getOrderStats() {
    const stats = await prisma.order.groupBy({
      by: ['orderStatus'],
      where: { isDeleted: false },
      _count: {
        id: true,
      },
    });

    // Format as { PENDING: 12, PROCESSING: 8, SHIPPED: 45, DELIVERED: 134, CANCELLED: 0 }
    const formatted = {
      PENDING: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    stats.forEach((stat) => {
      formatted[stat.orderStatus] = stat._count.id;
    });

    // Add total count
    formatted.TOTAL = Object.values(formatted).reduce((sum, count) => sum + count, 0);

    return formatted;
  }

  /**
   * Get revenue overview for admin dashboard
   * Returns monthly totals for the current year and previous year
   */
  async getRevenueOverview(filterYear = null) {
    const now = new Date();
    const todayYear = now.getUTCFullYear();
    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sum = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);

    // Helper: query monthly revenue totals for one calendar year
    const fetchYear = async (year) => {
      const start = new Date(Date.UTC(year, 0, 1));
      const end   = new Date(Date.UTC(year + 1, 0, 1));
      const rows = await prisma.$queryRaw`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as month,
               COALESCE(SUM(CAST("totalPrice" AS numeric)), 0) as total
        FROM   "Order"
        WHERE  "isDeleted" = false
          AND  "paymentStatus" = 'PAID'
          AND  "createdAt" >= ${start}
          AND  "createdAt" <  ${end}
        GROUP  BY month
        ORDER  BY month;
      `;
      const monthly = Array(12).fill(0);
      for (const row of rows) {
        const idx = Number((row.month || '').split('-')[1]) - 1;
        if (idx >= 0 && idx < 12) monthly[idx] = parseFloat(row.total) || 0;
      }
      return { year, monthly, total: sum(monthly) };
    };

    // If a specific year is requested, return only that year
    if (filterYear) {
      const yearData = await fetchYear(filterYear);
      return { labels: monthLabels, year: yearData };
    }

    // Default: return both current and previous year in parallel
    const [currentYear, previousYear] = await Promise.all([
      fetchYear(todayYear),
      fetchYear(todayYear - 1),
    ]);

    return { labels: monthLabels, currentYear, previousYear };
  }

  /**
   * Get dashboard overview values: status cards and recent orders
   */
  async getDashboardOverview() {
    // Run all independent queries in parallel for performance
    const [
      totalSalesAgg,
      activeOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalActiveProducts,
      newPhones,
      recent,
    ] = await Promise.all([
      // Total revenue from paid orders
      prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: { isDeleted: false, paymentStatus: 'PAID' },
      }),
      // Active orders = pending + processing + shipped
      prisma.order.count({
        where: { isDeleted: false, orderStatus: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] } },
      }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: 'PENDING' } }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: 'DELIVERED' } }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: 'CANCELLED' } }),
      // All active products regardless of category
      prisma.product.count({ where: { isDeleted: false, listingStatus: 'ACTIVE' } }),
      // "New" phones = products in the "New" category
      prisma.product.count({
        where: {
          isDeleted: false,
          listingStatus: 'ACTIVE',
          category: { name: { equals: 'New', mode: 'insensitive' } },
        },
      }),
      // Recent orders (latest 5)
      prisma.order.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: { select: { id: true, email: true } },
          orderItems: {
            include: {
              product: { select: { id: true, title: true, productGalleries: { select: { imageUrl: true }, orderBy: { displayOrder: 'asc' }, take: 1 } } },
            },
          },
        },
      }),
    ]);

    const totalSales = parseFloat(totalSalesAgg._sum.totalPrice || 0);
    // usedPhones = products in the "Used" category
    const usedPhones = await prisma.product.count({
      where: {
        isDeleted: false,
        listingStatus: 'ACTIVE',
        category: { name: { equals: 'Used', mode: 'insensitive' } },
      },
    });

    const recentOrders = recent.map((o) => {
      const firstItem = o.orderItems && o.orderItems[0];
      const thumbnail = firstItem && firstItem.product && firstItem.product.productGalleries && firstItem.product.productGalleries[0]
        ? buildImageUrl(firstItem.product.productGalleries[0].imageUrl)
        : null;

      return {
        id: o.id,
        orderId: o.stringId,
        totalPrice: parseFloat(o.totalPrice),
        status: o.orderStatus,
        paymentStatus: o.paymentStatus,
        customer: o.user ? { id: o.user.id, email: o.user.email } : null,
        product: firstItem && firstItem.product ? { id: firstItem.product.id, title: firstItem.product.title, thumbnail } : null,
        createdAt: o.createdAt,
      };
    });

    return {
      cards: {
        totalSales,
        activeOrders,
        newPhones,
        usedPhones,
        pendingOrders,
        completedOrders,
        cancelledOrders,
      },
      recentOrders,
    };
  }

  /**
   * Delete order (soft delete) - Admin only
   */
  async deleteOrder(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (order.isDeleted) {
      throw new AppError('Order already deleted', 400);
    }

    const deletedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return { success: true, message: 'Order deleted successfully' };
  }

  /**
   * Format order for response
   */
  #formatOrder(order, includeUserInfo = false) {
    const formatted = {
      id: order.id,
      orderId: order.stringId,
      totalPrice: parseFloat(order.totalPrice),
      shippingCost: parseFloat(order.shippingCost),
      shippingMethod: order.shippingMethod,
      discountTotal: parseFloat(order.discountTotal),
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.address ? {
        fullName: order.address.fullName,
        phone: order.address.phone,
        street: order.address.street,
        city: order.address.city,
        state: order.address.state,
        zipCode: order.address.zipCode,
        country: order.address.country,
      } : null,
      items: order.orderItems.map((item) => {
        const thumbnail = item.product.productGalleries?.[0]
          ? buildImageUrl(item.product.productGalleries[0].imageUrl)
          : null;

        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: parseFloat(item.priceAtPurchase),
          product: {
            id: item.product.id,
            title: item.product.title,
            thumbnail,
          },
          selectedOptions: {
            color: {
              id: item.color.id,
              name: item.color.name,
            },
            storage: {
              id: item.storageOption.id,
              name: item.storageOption.name,
            },
            ram: {
              id: item.ramOption.id,
              name: item.ramOption.name,
            },
          },
          subtotal: parseFloat(item.priceAtPurchase) * item.quantity,
        };
      }),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    // Include user info for admin views
    if (includeUserInfo && order.user) {
      formatted.user = {
        id: order.user.id,
        email: order.user.email,
      };
      // Include cancellation info for cancelled orders
      if (order.orderStatus === 'CANCELLED') {
        formatted.cancelledAt = order.cancelledAt;
        formatted.cancellationReason = order.cancellationReason;
      }
    }

    return formatted;
  }
}

export default new OrderService();
