import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";

/**
 * CartService
 * Handles user cart operations with product option selections
 */
class CartService {
  /**
   * Add product to cart with selected options
   * User selects: color, storage, RAM when adding to cart
   */
  async addToCart(userId, data) {
    const { productId, colorId, storageOptionId, ramOptionId, quantity } = data;

    // Validate quantity
    const qty = parseInt(quantity) || 1;
    if (qty < 1) {
      throw new AppError("Quantity must be at least 1", 400);
    }

    // Verify product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        colors: {
          where: { colorId },
          include: { color: true },
        },
        storageOptions: {
          where: { storageOptionId },
          include: { storageOption: true },
        },
        ramOptions: {
          where: { ramOptionId },
          include: { ramOption: true },
        },
      },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    if (product.listingStatus !== "ACTIVE") {
      throw new AppError("Product is not available for purchase", 400);
    }

    // Verify selected options are available for this product
    if (product.colors.length === 0) {
      throw new AppError("Selected color is not available for this product", 400);
    }
    if (product.storageOptions.length === 0) {
      throw new AppError("Selected storage option is not available for this product", 400);
    }
    if (product.ramOptions.length === 0) {
      throw new AppError("Selected RAM option is not available for this product", 400);
    }

    // Check stock availability
    if (product.stockQuantity < qty) {
      throw new AppError(`Only ${product.stockQuantity} items in stock`, 400);
    }

    // Check if this exact configuration already exists in user's cart
    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        userId,
        productId,
        colorId,
        storageOptionId,
        ramOptionId,
      },
    });

    if (existingCartItem) {
      // Update quantity instead of creating duplicate
      const newQuantity = existingCartItem.quantity + qty;

      // Validate against stock
      if (product.stockQuantity < newQuantity) {
        throw new AppError(
          `Cannot add ${qty} more. Only ${product.stockQuantity} items in stock and you already have ${existingCartItem.quantity} in cart.`,
          400,
        );
      }

      const updated = await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { quantity: newQuantity },
      });

      return this.#formatCartItem({
        ...updated,
        product,
        color: product.colors[0].color,
        storageOption: product.storageOptions[0].storageOption,
        ramOption: product.ramOptions[0].ramOption,
      });
    }

    // Create new cart item
    const cartItem = await prisma.cartItem.create({
      data: {
        userId,
        productId,
        colorId,
        storageOptionId,
        ramOptionId,
        quantity: qty,
      },
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
    });

    return this.#formatCartItem(cartItem);
  }

  /**
   * Get user's cart with all items
   */
  async getCart(userId) {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
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
      orderBy: { createdAt: "desc" },
    });

    const items = cartItems.map((item) => this.#formatCartItem(item));

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      items,
      subtotal,
      totalItems,
    };
  }

  /**
   * Update cart item quantity
   */
  async updateCartItemQuantity(userId, cartItemId, quantity) {
    const qty = parseInt(quantity);
    if (qty < 1) {
      throw new AppError("Quantity must be at least 1", 400);
    }

    // Verify ownership
    const cartItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, userId },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new AppError("Cart item not found", 404);
    }

    // Check stock
    if (cartItem.product.stockQuantity < qty) {
      throw new AppError(
        `Only ${cartItem.product.stockQuantity} items in stock`,
        400,
      );
    }

    const updated = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity: qty },
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
    });

    return this.#formatCartItem(updated);
  }

  /**
   * Remove item from cart
   */
  async removeCartItem(userId, cartItemId) {
    // Verify ownership
    const cartItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, userId },
    });

    if (!cartItem) {
      throw new AppError("Cart item not found", 404);
    }

    await prisma.cartItem.delete({
      where: { id: cartItemId },
    });

    return true;
  }

  /**
   * Clear entire cart
   */
  async clearCart(userId) {
    await prisma.cartItem.deleteMany({
      where: { userId },
    });

    return true;
  }

  /**
   * Format cart item for response
   */
  #formatCartItem(item) {
    const thumbnail = item.product.productGalleries?.[0]
      ? buildImageUrl(item.product.productGalleries[0].imageUrl)
      : null;

    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        title: item.product.title,
        basePrice: item.product.basePrice,
        stockQuantity: item.product.stockQuantity,
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
      // Calculate item total (price × quantity)
      total: item.product.basePrice * item.quantity,
      createdAt: item.createdAt,
    };
  }
}

export default new CartService();
