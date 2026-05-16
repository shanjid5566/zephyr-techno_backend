import { Router } from 'express';
import { authenticate, adminGuard } from '../../middleware/auth.middleware.js';
import ctrl from '../../controllers/admin/attributes.controller.js';

const adminAttributesRoutes = Router();

// All routes below require a valid JWT + ADMIN role
adminAttributesRoutes.use(authenticate, adminGuard);

// ─── CATEGORIES ────────────────────────────────────────────────
adminAttributesRoutes.post('/categories', ctrl.createCategory);
adminAttributesRoutes.get('/categories', ctrl.getAllCategories);
adminAttributesRoutes.get('/categories/:id', ctrl.getCategoryById);
adminAttributesRoutes.patch('/categories/:id', ctrl.updateCategory);
adminAttributesRoutes.delete('/categories/:id', ctrl.deleteCategory);

// ─── SERIES ────────────────────────────────────────────────────
adminAttributesRoutes.post('/series', ctrl.createSeries);
adminAttributesRoutes.get('/series', ctrl.getAllSeries);
adminAttributesRoutes.get('/series/:id', ctrl.getSeriesById);
adminAttributesRoutes.patch('/series/:id', ctrl.updateSeries);
adminAttributesRoutes.delete('/series/:id', ctrl.deleteSeries);

// ─── DEVICE MODELS ─────────────────────────────────────────────
adminAttributesRoutes.post('/models', ctrl.createDeviceModel);
adminAttributesRoutes.get('/models', ctrl.getAllDeviceModels);
adminAttributesRoutes.get('/models/:id', ctrl.getDeviceModelById);
adminAttributesRoutes.patch('/models/:id', ctrl.updateDeviceModel);
adminAttributesRoutes.delete('/models/:id', ctrl.deleteDeviceModel);

// ─── CONDITIONS (name management) ─────────────────────────────
adminAttributesRoutes.post('/conditions', ctrl.createCondition);
adminAttributesRoutes.get('/conditions', ctrl.getAllConditions);
adminAttributesRoutes.get('/conditions/:id', ctrl.getConditionById);
adminAttributesRoutes.patch('/conditions/:id', ctrl.updateCondition);
adminAttributesRoutes.delete('/conditions/:id', ctrl.deleteCondition);

// ─── CONDITION PRICES (basePrice management) ───────────────────
adminAttributesRoutes.get('/condition-prices', ctrl.getAllConditionPrices);
adminAttributesRoutes.patch('/condition-prices/:id', ctrl.setConditionPrice);

// ─── COLORS ────────────────────────────────────────────────────
adminAttributesRoutes.post('/colors', ctrl.createColor);
adminAttributesRoutes.get('/colors', ctrl.getAllColors);
adminAttributesRoutes.get('/colors/:id', ctrl.getColorById);
adminAttributesRoutes.patch('/colors/:id', ctrl.updateColor);
adminAttributesRoutes.delete('/colors/:id', ctrl.deleteColor);

// ─── STORAGE OPTIONS ───────────────────────────────────────────
adminAttributesRoutes.post('/storage-options', ctrl.createStorageOption);
adminAttributesRoutes.get('/storage-options', ctrl.getAllStorageOptions);
adminAttributesRoutes.get('/storage-options/:id', ctrl.getStorageOptionById);
adminAttributesRoutes.patch('/storage-options/:id', ctrl.updateStorageOption);
adminAttributesRoutes.delete('/storage-options/:id', ctrl.deleteStorageOption);

// ─── RAM OPTIONS ───────────────────────────────────────────────
adminAttributesRoutes.post('/ram-options', ctrl.createRamOption);
adminAttributesRoutes.get('/ram-options', ctrl.getAllRamOptions);
adminAttributesRoutes.get('/ram-options/:id', ctrl.getRamOptionById);
adminAttributesRoutes.patch('/ram-options/:id', ctrl.updateRamOption);
adminAttributesRoutes.delete('/ram-options/:id', ctrl.deleteRamOption);

export default adminAttributesRoutes;
