import usersService from '../services/users.service.js';
import asyncHandler from '../utils/async-handler.js';

class UsersController {
  getAllUsers = asyncHandler(async (req, res) => {
    // Page-based pagination: accept `page` & `limit` query params
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const result = await usersService.getAllUsers({ ...req.query, limit, offset }, { onlyCustomers: true });

    const total = result.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: result.data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    res.status(200).json({ success: true, data: result.data, meta });
  });

  getUserById = asyncHandler(async (req, res) => {
    const data = await usersService.getUserById(req.params.id);
    // Only return individual user if they are a CUSTOMER; hide admins
    if (data.role !== 'CUSTOMER') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, data });
  });



  updateUser = asyncHandler(async (req, res) => {
    const data = await usersService.updateUser(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'User updated.', data });
  });

  deleteUser = asyncHandler(async (req, res) => {
    await usersService.deleteUser(req.params.id);
    res.status(200).json({ success: true, message: 'User deleted.' });
  });
}

export default new UsersController();
