import orderService from "../services/orders.service.js";
import asyncHandler from "../utils/async-handler.js";

/**
 * OrderController
 * Handles HTTP requests for order operations
 */
class OrderController {
  /**
   * POST /api/orders
   * Create order from cart (checkout)
   */
  createOrder = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const order = await orderService.createOrder(userId, req.body);

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  });

  /**
   * GET /api/orders
   * Get user's orders
   */
  getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const orders = await orderService.getUserOrders(userId, req.query);

    res.status(200).json({
      success: true,
      data: orders,
    });
  });

  /**
   * GET /api/orders/:id
   * Get order details
   */
  getOrderById = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const isAdmin = req.user.role === "ADMIN";

    const order = await orderService.getOrderById(id, userId, isAdmin);

    res.status(200).json({
      success: true,
      data: order,
    });
  });

  /**
   * GET /api/admin/orders
   * Get all orders (Admin only)
   */
  getAllOrders = asyncHandler(async (req, res) => {
    const orders = await orderService.getAllOrders(req.query);

    res.status(200).json({
      success: true,
      data: orders,
    });
  });

  /**
   * GET /api/admin/orders/stats
   * Get order statistics overview (Admin only)
   */
  getOrderStats = asyncHandler(async (req, res) => {
    const stats = await orderService.getOrderStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  });

  /**
   * PATCH /api/admin/orders/:id/status
   * Update order status (Admin only)
   */
  updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const order = await orderService.updateOrderStatus(id, status);

    res.status(200).json({
      success: true,
      message: "Order status updated",
      data: order,
    });
  });

  /**
   * DELETE /api/admin/orders/:id
   * Delete order (soft delete) - Admin only
   */
  deleteOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await orderService.deleteOrder(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  });
}

export default new OrderController();
