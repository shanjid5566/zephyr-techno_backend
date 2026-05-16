import productService from '../services/product.service.js';
import asyncHandler from '../utils/async-handler.js';

class ProductController {
  createProduct = asyncHandler(async (req, res) => {
    const data = await productService.createProduct(req.body, req.files);
    res.status(201).json({ 
      success: true, 
      message: 'Product created successfully.',
      data: { id: data.id }
    });
  });

  getAllProducts = asyncHandler(async (req, res) => {
    const data = await productService.getAllProducts(req.query);
    res.status(200).json({ success: true, data });
  });

  getProductById = asyncHandler(async (req, res) => {
    const data = await productService.getProductById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateProduct = asyncHandler(async (req, res) => {
    const data = await productService.updateProduct(req.params.id, req.body, req.files);
    res.status(200).json({ 
      success: true, 
      message: 'Product updated successfully.',
      data: { id: data.id }
    });
  });

  deleteProduct = asyncHandler(async (req, res) => {
    await productService.deleteProduct(req.params.id);
    res.status(200).json({ success: true, message: 'Product deleted successfully.' });
  });

  changeFeatured = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isFeatured } = req.body; // accept { "isFeatured": true }
    const updated = await productService.changeProductFeatured(id, isFeatured);
    res.status(200).json({ success: true, message: 'Product featured status updated.', data: updated });
  });
}

export default new ProductController();
