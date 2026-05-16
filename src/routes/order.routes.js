import { Router } from "express";
import orderController from "../controllers/order.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// All order routes require authentication
router.use(authenticate);

// User order operations
router.post("/", orderController.createOrder);
router.get("/", orderController.getUserOrders);
router.get("/:id", orderController.getOrderById);

export default router;
