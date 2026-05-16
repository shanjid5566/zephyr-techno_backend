import cartService from "../services/cart.service.js";
import asyncHandler from "../utils/async-handler.js";

/**
 * CartController
 * Handles HTTP requests for cart operations
 */
class CartController {
  /**
   * POST /api/cart
   * Add product to cart with selected options
   */
  addToCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cartItem = await cartService.addToCart(userId, req.body);

    res.status(201).json({
      success: true,
      message: "Item added to cart",
      data: cartItem,
    });
  });

  /**
   * GET /api/cart
   * Get user's cart
   */
  getCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cart = await cartService.getCart(userId);

    res.status(200).json({
      success: true,
      data: cart,
    });
  });

  /**
   * PATCH /api/cart/:id
   * Update cart item quantity
   */
  updateCartItem = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity } = req.body;

    const updatedItem = await cartService.updateCartItemQuantity(
      userId,
      id,
      quantity,
    );

    res.status(200).json({
      success: true,
      message: "Cart item updated",
      data: updatedItem,
    });
  });

  /**
   * DELETE /api/cart/:id
   * Remove item from cart
   */
  removeCartItem = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    await cartService.removeCartItem(userId, id);

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
    });
  });

  /**
   * DELETE /api/cart
   * Clear entire cart
   */
  clearCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await cartService.clearCart(userId);

    res.status(200).json({
      success: true,
      message: "Cart cleared",
    });
  });
}

export default new CartController();
