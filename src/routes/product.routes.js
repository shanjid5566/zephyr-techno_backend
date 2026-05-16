import { Router } from 'express';
import productController from '../controllers/product.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const productRoutes = Router();

// Apply authentication and admin guard to all routes
productRoutes.use(authenticate, adminGuard);

// Create product (accepts up to 10 images)
productRoutes.post('/', upload.array('images', 10), productController.createProduct);

// Get all products (with optional filtering via query params)
productRoutes.get('/', productController.getAllProducts);

// Get single product
productRoutes.get('/:id', productController.getProductById);

// Update product (accepts up to 10 images for adding new ones)
productRoutes.patch('/:id', upload.array('images', 10), productController.updateProduct);

// Soft Delete product
productRoutes.delete('/:id', productController.deleteProduct);

// Toggle featured status (admin only)
productRoutes.patch('/:id/feature', productController.changeFeatured);

export default productRoutes;
