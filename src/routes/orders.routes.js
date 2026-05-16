import { Router } from 'express';
import orderController from '../controllers/orders.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

// Public (user) order routes
const publicRouter = Router();
publicRouter.use(authenticate);
publicRouter.post('/', orderController.createOrder);
publicRouter.get('/', orderController.getUserOrders);
publicRouter.get('/:id', orderController.getOrderById);

// Admin order routes
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(adminGuard);
adminRouter.get('/', orderController.getAllOrders);
adminRouter.patch('/:id/status', orderController.updateOrderStatus);

export default publicRouter;
export { adminRouter };
