import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';
import bcrypt from 'bcryptjs';

class UserService {
  async getAllUsers(query = {}, options = { onlyCustomers: true }) {
    let { q, role, limit = 50, offset = 0 } = query;
    limit = Math.min(Number(limit) || 50, 100); // cap limit to prevent expensive queries
    offset = Number(offset) || 0;

    const where = {};
    if (options.onlyCustomers) {
      where.role = 'CUSTOMER';
    } else if (role) {
      where.role = role;
    }
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Run count and findMany in parallel for better performance
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          isEmailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return { total, data: users };
  }

  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }


  async updateUser(id, data) {
    const updateData = {};
    const allowed = ['firstName', 'lastName', 'phone', 'role', 'isEmailVerified'];
    for (const k of allowed) if (data[k] !== undefined) updateData[k] = data[k];

    if (Object.keys(updateData).length === 0) throw new AppError('No valid fields to update', 400);

    const updated = await prisma.user.update({ where: { id }, data: updateData, select: { id: true, email: true } });
    return updated;
  }

  async deleteUser(id) {
    // Soft-delete via status change to keep records auditable and reversible
    const updated = await this.changeUserStatus(id, 'DELETED');
    return updated;
  }

  async changeUserStatus(id, status) {
    const allowed = ['ACTIVE', 'SUSPENDED', 'DELETED'];
    if (!allowed.includes(status)) throw new AppError('Invalid status', 400);

    try {
      const data = { status };
      if (status === 'DELETED') {
        data.isDeleted = true;
        data.deletedAt = new Date();
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          isEmailVerified: true,
          isDeleted: true,
          deletedAt: true,
          createdAt: true,
        },
      });

      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('User not found', 404);
      throw err;
    }
  }
}

export default new UserService();
