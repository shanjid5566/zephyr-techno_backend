import promoService from '../services/promo.service.js';
import asyncHandler from '../utils/async-handler.js';

class PromoController {
  createPromo = asyncHandler(async (req, res) => {
    const data = await promoService.createPromo(req.body);
    res.status(201).json({ success: true, message: 'Promo code created.', data });
  });

  getAllPromos = asyncHandler(async (req, res) => {
    const { total, data, page, limit } = await promoService.getAllPromos(req.query);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = { total, page, limit, totalPages, count: data.length, hasNext: page < totalPages, hasPrev: page > 1 };
    res.status(200).json({ success: true, data, meta });
  });

  getPromoById = asyncHandler(async (req, res) => {
    const data = await promoService.getPromoById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updatePromo = asyncHandler(async (req, res) => {
    const data = await promoService.updatePromo(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Promo updated.', data });
  });

  deletePromo = asyncHandler(async (req, res) => {
    const data = await promoService.deletePromo(req.params.id);
    res.status(200).json({ success: true, message: 'Promo deleted (soft).', data });
  });
}

export default new PromoController();
