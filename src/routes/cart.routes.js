import { Router } from "express";
import cartController from "../controllers/cart.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// All cart routes require authentication
router.use(authenticate);

// Cart operations
router.post("/", cartController.addToCart);
router.get("/", cartController.getCart);
router.patch("/:id", cartController.updateCartItem);
router.delete("/:id", cartController.removeCartItem);
router.delete("/", cartController.clearCart);

export default router;
