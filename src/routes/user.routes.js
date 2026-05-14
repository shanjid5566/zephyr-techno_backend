const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

/**
 * User Routes
 * Base path: /api/users
 */

// GET all users
router.get('/', userController.getAllUsers.bind(userController));

// GET single user by ID
router.get('/:id', userController.getUserById.bind(userController));

// POST create new user
router.post('/', userController.createUser.bind(userController));

// PUT update existing user
router.put('/:id', userController.updateUser.bind(userController));

// DELETE user
router.delete('/:id', userController.deleteUser.bind(userController));

module.exports = router;
