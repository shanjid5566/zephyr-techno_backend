import { Router } from 'express';
import ctrl from '../controllers/sell.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

const router = Router();

// Public sell-your-phone endpoints
router.get('/series', ctrl.getAllSeries);
router.get('/models', ctrl.getModelsBySeries);
router.get('/conditions', ctrl.getAllConditions);
router.get('/price', ctrl.getPrice);
router.post('/finalize', ctrl.finalizeSale);

// Admin router for sell requests (protected)
const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', ctrl.adminGetAll);
adminRouter.get('/:id', ctrl.adminGetById);
adminRouter.patch('/:id', ctrl.adminUpdate);
adminRouter.delete('/:id', ctrl.adminDelete);

export default router;
export { adminRouter };
