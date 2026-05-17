import { Router } from 'express';
import productCtrl from '../../controllers/product.controller.js';
import paymentsCtrl from '../../controllers/payments.controller.js';
import attributesCtrl from '../../controllers/attributes.controller.js';
import promoCtrl from '../../controllers/promo.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const publicProductRoutes = Router();

// Public attributes for product filters
publicProductRoutes.get('/attributes', attributesCtrl.getPublicProductAttributes);

// Public product listing and detail
publicProductRoutes.get('/', productCtrl.getAllProducts);
publicProductRoutes.get('/:id', productCtrl.getProductById);

// Validate promo code (requires auth to read user's cart)
publicProductRoutes.post('/promo/validate', authenticate, promoCtrl.validatePromoCode);

// Checkout (create Stripe session)
publicProductRoutes.post('/checkout', authenticate, paymentsCtrl.createCheckoutSession);
// Confirm checkout (retrieve session status and mark order as processed)
publicProductRoutes.post('/checkout/confirm', paymentsCtrl.confirmCheckoutSession);

export default publicProductRoutes;
