import { Router } from "express";
import orderController from "../controllers/order.controller.js";
import { authenticate, adminGuard } from "../middleware/auth.middleware.js";

const router = Router();

// All admin order routes require authentication and admin role
router.use(authenticate);
router.use(adminGuard);

// Admin order operations
router.get("/", orderController.getAllOrders);
router.patch("/:id/status", orderController.updateOrderStatus);

export default router;
