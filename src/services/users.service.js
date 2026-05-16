import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';
import bcrypt from 'bcryptjs';

class UserService {
  async getAllUsers(query = {}) {
    const { q, role, limit = 50, offset = 0 } = query;
    const where = {};
    if (role) where.role = role;
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
    });

    return users;
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
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async createUser(data) {
    const { email, password, firstName, lastName, phone, role } = data;
    if (!email || !password) throw new AppError('Email and password are required', 400);

    const existing = await prisma.user.findFirst({ where: { email }, includeDeleted: true });
    if (existing) throw new AppError('Email already in use', 409);

    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        firstName: firstName || '',
        lastName: lastName || '',
        phone: phone || null,
        role: role || 'CUSTOMER',
      },
      select: { id: true, email: true },
    });

    return created;
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
    try {
      await prisma.user.delete({ where: { id } });
      return true;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('User not found', 404);
      throw err;
    }
  }
}

export default new UserService();
