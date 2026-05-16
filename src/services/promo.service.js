import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

class PromoService {
  async createPromo(data) {
    const {
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxUsageCount,
      startDate,
      expiryDate,
      isActive = true,
    } = data;

    if (!code || !discountValue || !startDate || !expiryDate) {
      throw new AppError('Missing required promo fields (code, discountValue, startDate, expiryDate)', 400);
    }

    const parsedDiscount = Number(discountValue);
    if (isNaN(parsedDiscount)) throw new AppError('Invalid discountValue', 400);

    // normalize stringified arrays from form-data
    if (typeof data.applicableSeriesIds === 'string') {
      try { data.applicableSeriesIds = JSON.parse(data.applicableSeriesIds); } catch (e) { /* leave as-is */ }
    }
    if (typeof data.applicableModelIds === 'string') {
      try { data.applicableModelIds = JSON.parse(data.applicableModelIds); } catch (e) { /* leave as-is */ }
    }

    const promo = await prisma.$transaction(async (tx) => {
      const created = await tx.promoCode.create({
        data: {
          code,
          discountType: discountType || 'PERCENTAGE',
          discountValue: parsedDiscount,
          minOrderValue: minOrderValue ? Number(minOrderValue) : null,
          maxUsageCount: maxUsageCount ? Number(maxUsageCount) : null,
          startDate: new Date(startDate),
          expiryDate: new Date(expiryDate),
          isActive: Boolean(isActive),
        },
      });

      // categories are not provided at create time by design
      // support series and model applicability (UI may send series as `applicableCategoryIds` or explicit fields)
      if (Array.isArray(data.applicableSeriesIds) && data.applicableSeriesIds.length > 0) {
        await tx.promoCodeSeriesBridge.createMany({
          data: data.applicableSeriesIds.map((sId) => ({ promoCodeId: created.id, seriesId: sId })),
          skipDuplicates: true,
        });
      }
      if (Array.isArray(data.applicableModelIds) && data.applicableModelIds.length > 0) {
        await tx.promoCodeModelBridge.createMany({
          data: data.applicableModelIds.map((mId) => ({ promoCodeId: created.id, modelId: mId })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return promo;
  }

  async getAllPromos(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = { isDeleted: false };
    if (query.q) {
      where.OR = [{ code: { contains: query.q, mode: 'insensitive' } }];
    }

    const [total, data] = await Promise.all([
      prisma.promoCode.count({ where }),
      prisma.promoCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          code: true,
          discountType: true,
          discountValue: true,
          minOrderValue: true,
          maxUsageCount: true,
          currentUsageCount: true,
          startDate: true,
          expiryDate: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, data, page, limit };
  }

  async getPromoById(id) {
    try {
      const promo = await prisma.promoCode.findUnique({
        where: { id },
        include: {
          // if the Prisma client is up-to-date these relations will exist
          promoCodeSeriesBridge: { include: { series: { select: { id: true, name: true } } } },
          promoCodeModelBridge: { include: { deviceModel: { select: { id: true, name: true } } } },
        },
      });
      if (!promo) throw new AppError('Promo code not found', 404);
      return promo;
    } catch (err) {
      // Fallback for mismatched Prisma client: fetch base promo and bridges separately
      if (err.name && err.name.includes('Prisma')) {
        const promo = await prisma.promoCode.findFirst({ where: { id, isDeleted: false } });
        if (!promo) throw new AppError('Promo code not found', 404);

        const [seriesBridges, modelBridges] = await Promise.all([
          prisma.promoCodeSeriesBridge.findMany({ where: { promoCodeId: id, isDeleted: false }, include: { series: { select: { id: true, name: true } } } }),
          prisma.promoCodeModelBridge.findMany({ where: { promoCodeId: id, isDeleted: false }, include: { deviceModel: { select: { id: true, name: true } } } }),
        ]);

        // attach bridged arrays in a shape similar to the expected include
        return Object.assign(promo, {
          promoCodeSeriesBridge: seriesBridges,
          promoCodeModelBridge: modelBridges,
        });
      }
      throw err;
    }
  }

  async updatePromo(id, data) {
    const allowed = ['code','discountType','discountValue','minOrderValue','maxUsageCount','startDate','expiryDate','isActive','applicableCategoryIds','applicableSeriesIds','applicableModelIds'];
    const updateData = {};
    for (const k of allowed) if (data[k] !== undefined) updateData[k] = data[k];

    // normalize stringified arrays from form-data
    if (typeof updateData.applicableSeriesIds === 'string') {
      try { updateData.applicableSeriesIds = JSON.parse(updateData.applicableSeriesIds); } catch (e) { }
    }
    if (typeof updateData.applicableModelIds === 'string') {
      try { updateData.applicableModelIds = JSON.parse(updateData.applicableModelIds); } catch (e) { }
    }

    // coerce boolean-like strings to actual booleans for Prisma
    if (updateData.isActive !== undefined) {
      if (typeof updateData.isActive === 'string') {
        const normalized = updateData.isActive.trim().toLowerCase();
        if (normalized === 'true') updateData.isActive = true;
        else if (normalized === 'false') updateData.isActive = false;
        else updateData.isActive = Boolean(updateData.isActive);
      } else {
        updateData.isActive = Boolean(updateData.isActive);
      }
    }

    if (updateData.discountValue !== undefined) {
      const parsed = Number(updateData.discountValue);
      if (isNaN(parsed)) throw new AppError('Invalid discountValue', 400);
      updateData.discountValue = parsed;
    }
    if (updateData.minOrderValue !== undefined) updateData.minOrderValue = updateData.minOrderValue ? Number(updateData.minOrderValue) : null;
    if (updateData.maxUsageCount !== undefined) updateData.maxUsageCount = updateData.maxUsageCount ? Number(updateData.maxUsageCount) : null;
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.expiryDate) updateData.expiryDate = new Date(updateData.expiryDate);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.promoCode.update({ where: { id }, data: updateData });

        if (Array.isArray(updateData.applicableCategoryIds)) {
          // soft-delete existing category bridges
          await tx.promoCodeCategoryBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableCategoryIds.length > 0) {
            await tx.promoCodeCategoryBridge.createMany({ data: updateData.applicableCategoryIds.map((cId) => ({ promoCodeId: id, categoryId: cId })), skipDuplicates: true });
          }
        }
        if (Array.isArray(updateData.applicableSeriesIds)) {
          // soft-delete existing series bridges
          await tx.promoCodeSeriesBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableSeriesIds.length > 0) {
            await tx.promoCodeSeriesBridge.createMany({ data: updateData.applicableSeriesIds.map((sId) => ({ promoCodeId: id, seriesId: sId })), skipDuplicates: true });
          }
        }
        if (Array.isArray(updateData.applicableModelIds)) {
          // soft-delete existing model bridges
          await tx.promoCodeModelBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableModelIds.length > 0) {
            await tx.promoCodeModelBridge.createMany({ data: updateData.applicableModelIds.map((mId) => ({ promoCodeId: id, modelId: mId })), skipDuplicates: true });
          }
        }

        return updated;
      });

      return result;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Promo code not found', 404);
      throw err;
    }
  }

  async deletePromo(id) {
    try {
      const updated = await prisma.promoCode.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), isActive: false }, select: { id: true, isDeleted: true, deletedAt: true } });
      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Promo code not found', 404);
      throw err;
    }
  }
}

export default new PromoService();
