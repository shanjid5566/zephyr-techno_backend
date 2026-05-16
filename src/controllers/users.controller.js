import usersService from '../services/users.service.js';
import asyncHandler from '../utils/async-handler.js';

class UsersController {
  getAllUsers = asyncHandler(async (req, res) => {
    const data = await usersService.getAllUsers(req.query);
    res.status(200).json({ success: true, data });
  });

  getUserById = asyncHandler(async (req, res) => {
    const data = await usersService.getUserById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  createUser = asyncHandler(async (req, res) => {
    const data = await usersService.createUser(req.body);
    res.status(201).json({ success: true, message: 'User created.', data });
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
