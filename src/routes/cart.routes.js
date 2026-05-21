import { Router } from "express";
import cartController from "../controllers/cart.controller.js";

const router = Router();

// Cart operations - Support both authenticated users and guest checkout
// Guests provide guestSessionId in request body/query
// Authenticated users provide JWT token in Authorization header
router.post("/", cartController.addToCart);
router.get("/", cartController.getCart);
router.patch("/:id", cartController.updateCartItem);
router.delete("/:id", cartController.removeCartItem);
router.delete("/", cartController.clearCart);

export default router;
