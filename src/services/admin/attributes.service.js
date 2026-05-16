import prisma from '../../utils/prisma.js';
import AppError from '../../utils/app-error.js';

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
    await this.#assertUnique('category', { name }, 'Category name already exists.');
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
    await this.#assertUnique('category', { name }, 'Category name already exists.', id);
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
    await this.#assertUnique('series', { name }, 'Series name already exists.');
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
    await this.#assertUnique('series', { name }, 'Series name already exists.', id);
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
    await this.#assertUnique('deviceModel', { name }, 'Model name already exists.');
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
      await this.#assertUnique('deviceModel', { name: data.name }, 'Model name already exists.', id);
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
    await this.#assertUnique('condition', { name }, 'Condition name already exists.');
    // basePrice defaults to 0 as defined in the schema
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
    await this.#assertUnique('condition', { name }, 'Condition name already exists.', id);
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
    await this.#assertUnique('color', { name }, 'Color name already exists.');
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
    await this.#assertUnique('color', { name }, 'Color name already exists.', id);
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
    await this.#assertUnique('storageOption', { name }, 'Storage option already exists.');
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
    await this.#assertUnique('storageOption', { name }, 'Storage option already exists.', id);
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
    await this.#assertUnique('ramOption', { name }, 'RAM option already exists.');
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
    await this.#assertUnique('ramOption', { name }, 'RAM option already exists.', id);
    return prisma.ramOption.update({ where: { id }, data: { name } });
  }

  async deleteRamOption(id) {
    await this.#findOrFail('ramOption', id, 'RAM option');
    return this.#safeDelete('ramOption', id, 'RAM option');
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
   * Check for a duplicate name, optionally excluding the record being updated.
   */
  async #assertUnique(model, where, message, excludeId = null) {
    const existing = await prisma[model].findUnique({ where });
    if (existing && existing.id !== excludeId) {
      throw new AppError(message, 409);
    }
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
