import { Router } from 'express';
import usersController from '../controllers/users.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

// Public routes (exported as default)
const publicRouter = Router();
publicRouter.get('/', (req, res) => res.status(200).json({ message: 'User routes are working' }));

// Admin routes (exported as named `adminRouter`)
const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', usersController.getAllUsers);
adminRouter.get('/:id', usersController.getUserById);
adminRouter.patch('/:id', usersController.updateUser);
adminRouter.delete('/:id', usersController.deleteUser);

export default publicRouter;
export { adminRouter };
