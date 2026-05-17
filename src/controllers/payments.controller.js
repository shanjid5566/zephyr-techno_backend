import paymentsService from '../services/payments.service.js';
import asyncHandler from '../utils/async-handler.js';

class PaymentsController {
  // POST /api/public/product/checkout
  createCheckoutSession = asyncHandler(async (req, res) => {
    const userId = req.user && req.user.id; // allow guest? require auth for now
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const { shippingAddress, cartItemIds, shippingMethod, shippingCost, promoCode } = req.body;
    if (!shippingAddress) return res.status(400).json({ success: false, message: 'shippingAddress required' });

    const { order, sessionUrl, sessionId } = await paymentsService.createCheckoutSession(userId, shippingAddress, cartItemIds, shippingMethod, shippingCost, promoCode);
    res.status(201).json({ success: true, data: { orderId: order.id, checkoutUrl: sessionUrl, sessionId } });
  });

  // POST /api/public/product/checkout/confirm
  confirmCheckoutSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const order = await paymentsService.confirmCheckoutSession(sessionId);

    res.status(200).json({ success: true, data: order });
  });
}

export default new PaymentsController();
