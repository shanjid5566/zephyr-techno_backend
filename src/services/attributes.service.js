import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

/**
 * Single service covering CRUD for all 7 admin-managed product attribute models:
 *  - Category
 *  - Series
 *  - DeviceModel  (requires seriesId)
 *  - Condition    (includes basePrice)
 *  - Color
 *  - StorageOption
 *  - RamOption
 */
class AttributesService {

  // ─────────────────────────────────────────────────────────────
  // CATEGORY
  // ─────────────────────────────────────────────────────────────

  async createCategory({ name }) {
    name = this.#requireString(name, 'Category name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('category', { name }, 'Category name already exists.');
    if (deletedRecord) {
      return prisma.category.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.category.create({ data: { name } });
  }

  async getAllCategories() {
    return prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async getCategoryById(id) {
    return this.#findOrFail('category', id, 'Category');
  }

  async updateCategory(id, { name }) {
    await this.#findOrFail('category', id, 'Category');
    name = this.#requireString(name, 'Category name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('category', { name }, 'Category name already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted category. Please use a different name.', 409);
    return prisma.category.update({ where: { id }, data: { name } });
  }

  async deleteCategory(id) {
    await this.#findOrFail('category', id, 'Category');
    return this.#safeDelete('category', id, 'Category');
  }

  // ─────────────────────────────────────────────────────────────
  // SERIES
  // ─────────────────────────────────────────────────────────────

  async createSeries({ name }) {
    name = this.#requireString(name, 'Series name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('series', { name }, 'Series name already exists.');
    if (deletedRecord) {
      return prisma.series.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.series.create({ data: { name } });
  }

  async getAllSeries() {
    return prisma.series.findMany({ orderBy: { name: 'asc' } });
  }

  async getSeriesById(id) {
    return this.#findOrFail('series', id, 'Series');
  }

  async updateSeries(id, { name }) {
    await this.#findOrFail('series', id, 'Series');
    name = this.#requireString(name, 'Series name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('series', { name }, 'Series name already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted series. Please use a different name.', 409);
    return prisma.series.update({ where: { id }, data: { name } });
  }

  async deleteSeries(id) {
    await this.#findOrFail('series', id, 'Series');
    return this.#safeDelete('series', id, 'Series');
  }

  // ─────────────────────────────────────────────────────────────
  // DEVICE MODEL
  // ─────────────────────────────────────────────────────────────

  async createDeviceModel({ name, seriesId }) {
    name = this.#requireString(name, 'Model name');
    seriesId = this.#requireString(seriesId, 'Series ID');
    await this.#findOrFail('series', seriesId, 'Series');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('deviceModel', { name }, 'Model name already exists.');
    if (deletedRecord) {
      return prisma.deviceModel.update({
        where: { id: deletedRecord.id },
        data: { seriesId, isDeleted: false, deletedAt: null },
        include: { series: { select: { id: true, name: true } } },
      });
    }
    return prisma.deviceModel.create({
      data: { name, seriesId },
      include: { series: { select: { id: true, name: true } } },
    });
  }

  async getAllDeviceModels() {
    return prisma.deviceModel.findMany({
      orderBy: { name: 'asc' },
      include: { series: { select: { id: true, name: true } } },
    });
  }

  async getDeviceModelById(id) {
    const record = await prisma.deviceModel.findUnique({
      where: { id },
      include: { series: { select: { id: true, name: true } } },
    });
    if (!record) throw new AppError('Model not found.', 404);
    return record;
  }

  async updateDeviceModel(id, { name, seriesId }) {
    await this.#findOrFail('deviceModel', id, 'Model');
    const data = {};
    if (name !== undefined) {
      data.name = this.#requireString(name, 'Model name');
      const deletedRecord = await this.#checkUniqueAndGetDeleted('deviceModel', { name: data.name }, 'Model name already exists.', id);
      if (deletedRecord) throw new AppError('Name is currently used by a deleted model. Please use a different name.', 409);
    }
    if (seriesId !== undefined) {
      data.seriesId = this.#requireString(seriesId, 'Series ID');
      await this.#findOrFail('series', data.seriesId, 'Series');
    }
    return prisma.deviceModel.update({
      where: { id },
      data,
      include: { series: { select: { id: true, name: true } } },
    });
  }

  async deleteDeviceModel(id) {
    await this.#findOrFail('deviceModel', id, 'Model');
    return this.#safeDelete('deviceModel', id, 'Model');
  }

  // ─────────────────────────────────────────────────────────────
  // CONDITION  (name management only)
  // ─────────────────────────────────────────────────────────────

  async createCondition({ name }) {
    name = this.#requireString(name, 'Condition name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('condition', { name }, 'Condition name already exists.');
    if (deletedRecord) {
      return prisma.condition.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.condition.create({ data: { name } });
  }

  async getAllConditions() {
    return prisma.condition.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async getConditionById(id) {
    return this.#findOrFail('condition', id, 'Condition');
  }

  async updateCondition(id, { name }) {
    await this.#findOrFail('condition', id, 'Condition');
    name = this.#requireString(name, 'Condition name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('condition', { name }, 'Condition name already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted condition. Please use a different name.', 409);
    return prisma.condition.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });
  }

  async deleteCondition(id) {
    await this.#findOrFail('condition', id, 'Condition');
    return this.#safeDelete('condition', id, 'Condition');
  }

  // ─────────────────────────────────────────────────────────────
  // CONDITION PRICE  (basePrice management only)
  // ─────────────────────────────────────────────────────────────

  async getAllConditionPrices() {
    return prisma.condition.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, basePrice: true },
    });
  }

  async setConditionPrice(id, { basePrice }) {
    await this.#findOrFail('condition', id, 'Condition');
    const price = this.#parsePrice(basePrice);
    return prisma.condition.update({
      where: { id },
      data: { basePrice: price },
      select: { id: true, name: true, basePrice: true },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // COLOR
  // ─────────────────────────────────────────────────────────────

  async createColor({ name }) {
    name = this.#requireString(name, 'Color name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('color', { name }, 'Color name already exists.');
    if (deletedRecord) {
      return prisma.color.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.color.create({ data: { name } });
  }

  async getAllColors() {
    return prisma.color.findMany({ orderBy: { name: 'asc' } });
  }

  async getColorById(id) {
    return this.#findOrFail('color', id, 'Color');
  }

  async updateColor(id, { name }) {
    await this.#findOrFail('color', id, 'Color');
    name = this.#requireString(name, 'Color name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('color', { name }, 'Color name already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted color. Please use a different name.', 409);
    return prisma.color.update({ where: { id }, data: { name } });
  }

  async deleteColor(id) {
    await this.#findOrFail('color', id, 'Color');
    return this.#safeDelete('color', id, 'Color');
  }

  // ─────────────────────────────────────────────────────────────
  // STORAGE OPTION
  // ─────────────────────────────────────────────────────────────

  async createStorageOption({ name }) {
    name = this.#requireString(name, 'Storage name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('storageOption', { name }, 'Storage option already exists.');
    if (deletedRecord) {
      return prisma.storageOption.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.storageOption.create({ data: { name } });
  }

  async getAllStorageOptions() {
    return prisma.storageOption.findMany({ orderBy: { name: 'asc' } });
  }

  async getStorageOptionById(id) {
    return this.#findOrFail('storageOption', id, 'Storage option');
  }

  async updateStorageOption(id, { name }) {
    await this.#findOrFail('storageOption', id, 'Storage option');
    name = this.#requireString(name, 'Storage name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('storageOption', { name }, 'Storage option already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted storage option. Please use a different name.', 409);
    return prisma.storageOption.update({ where: { id }, data: { name } });
  }

  async deleteStorageOption(id) {
    await this.#findOrFail('storageOption', id, 'Storage option');
    return this.#safeDelete('storageOption', id, 'Storage option');
  }

  // ─────────────────────────────────────────────────────────────
  // RAM OPTION
  // ─────────────────────────────────────────────────────────────

  async createRamOption({ name }) {
    name = this.#requireString(name, 'RAM name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('ramOption', { name }, 'RAM option already exists.');
    if (deletedRecord) {
      return prisma.ramOption.update({ where: { id: deletedRecord.id }, data: { isDeleted: false, deletedAt: null } });
    }
    return prisma.ramOption.create({ data: { name } });
  }

  async getAllRamOptions() {
    return prisma.ramOption.findMany({ orderBy: { name: 'asc' } });
  }

  async getRamOptionById(id) {
    return this.#findOrFail('ramOption', id, 'RAM option');
  }

  async updateRamOption(id, { name }) {
    await this.#findOrFail('ramOption', id, 'RAM option');
    name = this.#requireString(name, 'RAM name');
    const deletedRecord = await this.#checkUniqueAndGetDeleted('ramOption', { name }, 'RAM option already exists.', id);
    if (deletedRecord) throw new AppError('Name is currently used by a deleted RAM option. Please use a different name.', 409);
    return prisma.ramOption.update({ where: { id }, data: { name } });
  }

  async deleteRamOption(id) {
    await this.#findOrFail('ramOption', id, 'RAM option');
    return this.#safeDelete('ramOption', id, 'RAM option');
  }

  // ─────────────────────────────────────────────────────────────
  // CONSOLIDATED ALL-OPTIONS (For product create/update forms)
  // ─────────────────────────────────────────────────────────────

  async getAllAttributeOptions() {
    const [categories, series, models, conditions, colors, storageOptions, ramOptions] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.series.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.deviceModel.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, seriesId: true } }),
      prisma.condition.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, basePrice: true } }),
      prisma.color.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.storageOption.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.ramOption.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);

    return { categories, series, models, conditions, colors, storageOptions, ramOptions };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  #requireString(value, fieldName) {
    const result = String(value || '').trim();
    if (!result) throw new AppError(`${fieldName} is required.`, 400);
    return result;
  }

  #parsePrice(value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) throw new AppError('basePrice must be a non-negative number.', 400);
    return num;
  }

  async #findOrFail(model, id, label) {
    const record = await prisma[model].findUnique({ where: { id } });
    if (!record) throw new AppError(`${label} not found.`, 404);
    return record;
  }

  /**
   * Check for a duplicate name.
   * Returns the soft-deleted existing record if one exists, so the caller can restore it.
   */
  async #checkUniqueAndGetDeleted(model, where, message, excludeId = null) {
    const existing = await prisma[model].findFirst({ where, includeDeleted: true });
    
    if (existing && existing.id !== excludeId) {
      if (!existing.isDeleted) {
        throw new AppError(message, 409);
      }
      return existing; // It is deleted, we can restore it!
    }
    return null;
  }

  /**
   * Attempt deletion and surface a friendly error if a FK constraint fires.
   */
  async #safeDelete(model, id, label) {
    try {
      return await prisma[model].delete({ where: { id } });
    } catch (err) {
      // Prisma error code P2003 = foreign key constraint failed
      if (err.code === 'P2003') {
        throw new AppError(
          `Cannot delete this ${label} because it is still referenced by existing products or variants.`,
          409,
        );
      }
      throw err;
    }
  }
}

export default new AttributesService();
