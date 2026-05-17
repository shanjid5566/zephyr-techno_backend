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
          address: true,
          orderItems: {
            include: {
              product: {
                include: {
                  productGalleries: {
                    orderBy: { displayOrder: "asc" },
                    take: 1,
                  },
                },
              },
              color: true,
              storageOption: true,
              ramOption: true,
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
      include: {
        address: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              include: {
                productGalleries: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                },
              },
            },
            color: true,
            storageOption: true,
            ramOption: true,
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
        address: true,
        user: { select: { id: true, email: true } },
        orderItems: {
          include: {
            product: { include: { productGalleries: { orderBy: { displayOrder: 'asc' }, take: 1 } } },
            color: true,
            storageOption: true,
            ramOption: true,
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
        address: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              include: {
                productGalleries: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                },
              },
            },
            color: true,
            storageOption: true,
            ramOption: true,
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
        address: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              include: {
                productGalleries: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                },
              },
            },
            color: true,
            storageOption: true,
            ramOption: true,
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
        address: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            product: {
              include: {
                productGalleries: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                },
              },
            },
            color: true,
            storageOption: true,
            ramOption: true,
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
    }

    return formatted;
  }
}

export default new OrderService();
