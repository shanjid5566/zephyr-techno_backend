import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

class SellService {
  async createSellRequest({ firstName, lastName, email, phone, deviceName, deviceModelId, conditionId, baseOfferPrice, userOfferedPrice = null, serialNumber, images = [] }) {
    if (!firstName) throw new AppError('First name is required.', 400);
    if (!email) throw new AppError('Email is required.', 400);
    if (!phone) throw new AppError('Phone is required.', 400);
    if (!deviceName) throw new AppError('Device name is required.', 400);
    if (baseOfferPrice === undefined || baseOfferPrice === null) throw new AppError('Offer price is required.', 400);

    // create a simple human-friendly stringId
    const stringId = `SR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

    const tx = await prisma.$transaction(async (tx) => {
      const rec = await tx.sellRequest.create({
        data: {
          stringId,
          firstName,
          lastName: lastName || '',
          email,
          phone,
          deviceName,
          deviceModelId: deviceModelId || null,
          conditionId: conditionId || null,
          baseOfferPrice,
          userOfferedPrice,
          serialNumber: serialNumber || null,
        },
      });

      if (images && images.length) {
        const imgs = images.map((url) => ({ sellRequestId: rec.id, imageUrl: url }));
        await tx.deviceImage.createMany({ data: imgs });
      }

      return rec;
    });

    return tx;
  }

  async getAllSellRequests({ page = 1, limit = 20, status, search, deviceModelId } = {}) {
    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = ((parseInt(page, 10) || 1) - 1) * take;

    const where = {};
    if (status) where.status = status;
    if (deviceModelId) where.deviceModelId = deviceModelId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { stringId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.sellRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: true,
          condition: { select: { name: true } },
          deviceModel: { select: { name: true } },
        },
      }),
      prisma.sellRequest.count({ where }),
    ]);

    return {
      data,
      meta: { page: parseInt(page, 10) || 1, limit: take, total },
    };
  }

  async getSellRequestById(id) {
    const rec = await prisma.sellRequest.findUniqueOrThrow({ where: { id }, include: { images: true, condition: { select: { name: true } }, deviceModel: { select: { name: true } } } });
    return rec;
  }

  async updateSellRequest(id, data) {
    try {
      const rec = await prisma.sellRequest.update({ where: { id }, data });
      return rec;
    } catch (err) {
      if (err.code === 'P2025') {
        throw new AppError('Sell request not found.', 404);
      }
      throw err;
    }
  }

  async deleteSellRequest(id) {
    try {
      // This will soft-delete via prisma wrapper
      return await prisma.sellRequest.delete({ where: { id } });
    } catch (err) {
      if (err.code === 'P2025') {
        throw new AppError('Sell request not found.', 404);
      }
      throw err;
    }
  }
}

export default new SellService();
