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
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const result = await orderService.getUserOrders(userId, { ...req.query, page, limit });

    const total = result.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: result.data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    res.status(200).json({ success: true, data: result.data, meta });
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
   * POST /api/orders/:id/cancel
   * Cancel order by authenticated user with a reason
   */
  cancelOrder = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required (min 3 chars)' });
    }

    const cancelled = await orderService.cancelOrderByUser(id, userId, reason);

    res.status(200).json({ success: true, message: 'Order cancelled', data: cancelled });
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
