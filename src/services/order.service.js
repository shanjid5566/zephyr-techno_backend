import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";

/**
 * OrderService
 * Handles order creation and management
 */
class OrderService {
  /**
   * Create order from cart (checkout)
   * Converts cart items to order items with price snapshot
   */
  async createOrder(userId, data) {
    const { shippingAddress, paymentMethod } = data;

    if (!shippingAddress) {
      throw new AppError("Shipping address is required", 400);
    }

    // Get user's cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
        color: true,
        storageOption: true,
        ramOption: true,
      },
    });

    if (cartItems.length === 0) {
      throw new AppError("Cart is empty", 400);
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

    // Create order and order items in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const createdOrder = await tx.order.create({
        data: {
          userId,
          total: orderTotal,
          status: "PENDING",
          shippingAddress,
          paymentMethod: paymentMethod || "COD",
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
        include: {
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

      // Decrease stock for all products
      for (const item of cartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      // Clear the cart
      await tx.cartItem.deleteMany({
        where: { userId },
      });

      return createdOrder;
    });

    return this.#formatOrder(order);
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId) {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
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

    return orders.map((order) => this.#formatOrder(order));
  }

  /**
   * Get order by ID (with authorization check)
   */
  async getOrderById(orderId, userId, isAdmin = false) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
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
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
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

    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
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
   * Format order for response
   */
  #formatOrder(order, includeUserInfo = false) {
    const formatted = {
      id: order.id,
      total: order.total,
      status: order.status,
      shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod,
      items: order.orderItems.map((item) => {
        const thumbnail = item.product.productGalleries?.[0]
          ? buildImageUrl(item.product.productGalleries[0].imageUrl)
          : null;

        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
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
          subtotal: item.priceAtPurchase * item.quantity,
        };
      }),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    // Include user info for admin views
    if (includeUserInfo && order.user) {
      formatted.user = {
        id: order.user.id,
        name: order.user.name,
        email: order.user.email,
      };
    }

    return formatted;
  }
}

export default new OrderService();
