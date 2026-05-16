import prisma from "../../utils/prisma.js";
import AppError from "../../utils/app-error.js";
import { buildImageUrl } from "../../utils/url.js";

class ProductService {
  /**
   * Helper to format product images
   */
  #formatProductGallery(galleries) {
    if (!galleries) return [];
    return galleries.map((gallery) => ({
      id: gallery.id,
      imageUrl: buildImageUrl(gallery.imageUrl),
      displayOrder: gallery.displayOrder,
    }));
  }

  /**
   * Master formatter: transforms raw Prisma product into a clean frontend-friendly shape.
   * - Extracts available options from bridge tables
   * - Removes internal soft-delete fields
   * - Formats image URLs
   */
  #formatProduct(product) {
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      introduction: product.introduction,
      basePrice: product.basePrice,
      stockQuantity: product.stockQuantity || 0,
      listingStatus: product.listingStatus,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,

      // Relations - clean, no soft-delete fields
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      series: product.series
        ? { id: product.series.id, name: product.series.name }
        : null,
      deviceModel: product.deviceModel
        ? { id: product.deviceModel.id, name: product.deviceModel.name }
        : null,
      condition: product.condition
        ? { id: product.condition.id, name: product.condition.name }
        : null,

      // Images with full URLs
      images: this.#formatProductGallery(product.productGalleries || []),

      // FAQs - clean
      faqs: (product.productFaqs || []).map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
      })),

      // Highlights & Specifications
      highlights: (product.highlights || []).map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description,
        iconUrl: h.iconUrl,
        displayOrder: h.displayOrder,
      })),
      specifications: (product.specifications || []).map((s) => ({
        id: s.id,
        name: s.name,
        value: s.value,
        displayOrder: s.displayOrder,
      })),

      // Available options from bridge tables
      availableColors: (product.colors || []).map((pc) => ({
        id: pc.color.id,
        name: pc.color.name,
      })),
      availableStorageOptions: (product.storageOptions || []).map((ps) => ({
        id: ps.storageOption.id,
        name: ps.storageOption.name,
      })),
      availableRamOptions: (product.ramOptions || []).map((pr) => ({
        id: pr.ramOption.id,
        name: pr.ramOption.name,
      })),
    };
  }

  /**
   * Lightweight formatter for list/card views (admin product grid).
   * Returns only what is needed to render a product card.
   */
  #formatProductCard(product) {
    // First image as thumbnail
    const thumbnail = product.productGalleries?.[0]
      ? buildImageUrl(product.productGalleries[0].imageUrl)
      : null;

    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
      stockQuantity: product.stockQuantity || 0,
      listingStatus: product.listingStatus,
      thumbnail,
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      series: product.series
        ? { id: product.series.id, name: product.series.name }
        : null,
      deviceModel: product.deviceModel
        ? { id: product.deviceModel.id, name: product.deviceModel.name }
        : null,
      condition: product.condition
        ? { id: product.condition.id, name: product.condition.name }
        : null,
      createdAt: product.createdAt,
    };
  }

  /**
   * Create a new Product
   */
  async createProduct(data, files) {
    const {
      title,
      introduction,
      basePrice,
      stockQuantity,
      listingStatus,
      categoryId,
      seriesId,
      deviceModelId,
      conditionId,
      faqs,
      highlights,
      specifications,
      colorIds,
      storageOptionIds,
      ramOptionIds,
    } = data;

    // Use introduction as description since the UI only provides Introduction
    const description = data.description || introduction || title;

    // Validate required fields
    if (
      !title ||
      !basePrice ||
      !categoryId ||
      !seriesId ||
      !deviceModelId ||
      !conditionId
    ) {
      throw new AppError(
        "Missing required product fields (title, basePrice, categoryId, seriesId, deviceModelId, conditionId)",
        400,
      );
    }

    // Process uploaded images
    let productGalleries = [];
    if (files && files.length > 0) {
      productGalleries = files.map((file, index) => ({
        imageUrl: file.path.replace(/\\/g, "/"),
        displayOrder: index,
      }));
    }

    // Process FAQs (usually sent as JSON string in form-data)
    let productFaqs = [];
    if (faqs) {
      try {
        const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs;
        if (Array.isArray(parsedFaqs)) {
          productFaqs = parsedFaqs.map((faq) => ({
            question: faq.question,
            answer: faq.answer,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid FAQs format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Process Highlights
    let productHighlights = [];
    if (highlights) {
      try {
        const parsedHighlights = typeof highlights === "string" ? JSON.parse(highlights) : highlights;
        if (Array.isArray(parsedHighlights)) {
          productHighlights = parsedHighlights.map((h) => ({
            title: h.title,
            description: h.description,
            iconUrl: h.iconUrl || null,
            displayOrder: h.displayOrder || 0,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid Highlights format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Process Specifications
    let productSpecifications = [];
    if (specifications) {
      try {
        const parsedSpecs = typeof specifications === "string" ? JSON.parse(specifications) : specifications;
        if (Array.isArray(parsedSpecs)) {
          productSpecifications = parsedSpecs.map((s) => ({
            name: s.name,
            value: s.value,
            displayOrder: s.displayOrder || 0,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid Specifications format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Helper to safely parse JSON arrays from form-data
    const parseArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch (e) {
        throw new AppError(`Invalid array format: ${val}`, 400);
      }
    };

    const colors = parseArray(colorIds);
    const storages = parseArray(storageOptionIds);
    const rams = parseArray(ramOptionIds);

    if (colors.length === 0 || storages.length === 0 || rams.length === 0) {
      throw new AppError(
        "At least one Color, Storage Option, and RAM Option must be selected.",
        400,
      );
    }

    const parsedStock = parseInt(stockQuantity) || 0;
    const parsedPrice = Number(basePrice);

    // Create product with bridge records in a transaction
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title,
          description,
          introduction,
          basePrice: parsedPrice,
          stockQuantity: parsedStock,
          listingStatus: listingStatus || "INACTIVE",
          categoryId,
          seriesId,
          deviceModelId,
          conditionId,
          productGalleries: { create: productGalleries },
          productFaqs: { create: productFaqs },
          highlights: { create: productHighlights },
          specifications: { create: productSpecifications },
          // Create bridge records for options
          colors: {
            create: colors.map((colorId) => ({ colorId })),
          },
          storageOptions: {
            create: storages.map((storageId) => ({
              storageOptionId: storageId,
            })),
          },
          ramOptions: {
            create: rams.map((ramId) => ({ ramOptionId: ramId })),
          },
        },
        select: {
          id: true,
        },
      });

      return created;
    });

    return product;
  }

  /**
   * Get all products with optional filters
   */
  async getAllProducts(query) {
    const { categoryId, listingStatus, conditionId } = query;

    const where = {};
    if (listingStatus) where.listingStatus = listingStatus;
    if (conditionId) where.conditionId = conditionId;

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        condition: { select: { id: true, name: true } },
        productGalleries: {
          orderBy: { displayOrder: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return products.map((p) => this.#formatProductCard(p));
  }

  /**
   * Get product by ID
   */
  async getProductById(id) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        condition: { select: { id: true, name: true } },
        productGalleries: true,
        productFaqs: true,
        highlights: true,
        specifications: true,
        colors: {
          include: {
            color: { select: { id: true, name: true } },
          },
        },
        storageOptions: {
          include: {
            storageOption: { select: { id: true, name: true } },
          },
        },
        ramOptions: {
          include: {
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    return this.#formatProduct(product);
  }

  /**
   * Update Product (Partial Update)
   */
  async updateProduct(id, data, files) {
    // Helper to safely parse JSON arrays from form-data
    const parseArray = (val) => {
      if (!val) return null;
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch (e) {
        throw new AppError(`Invalid array format: ${val}`, 400);
      }
    };

    // Parse all JSON fields upfront
    let parsedFaqs = null;
    let parsedHighlights = null;
    let parsedSpecs = null;
    let parsedColors = null;
    let parsedStorages = null;
    let parsedRams = null;

    if (data.faqs !== undefined) {
      parsedFaqs = parseArray(data.faqs);
      if (parsedFaqs && !Array.isArray(parsedFaqs)) {
        throw new AppError("Invalid FAQs format. Must be a valid JSON array.", 400);
      }
    }

    if (data.highlights !== undefined) {
      parsedHighlights = parseArray(data.highlights);
      if (parsedHighlights && !Array.isArray(parsedHighlights)) {
        throw new AppError("Invalid Highlights format. Must be a valid JSON array.", 400);
      }
    }

    if (data.specifications !== undefined) {
      parsedSpecs = parseArray(data.specifications);
      if (parsedSpecs && !Array.isArray(parsedSpecs)) {
        throw new AppError("Invalid Specifications format. Must be a valid JSON array.", 400);
      }
    }

    if (data.colorIds) parsedColors = parseArray(data.colorIds);
    if (data.storageOptionIds) parsedStorages = parseArray(data.storageOptionIds);
    if (data.ramOptionIds) parsedRams = parseArray(data.ramOptionIds);

    // Use transaction for all operations
    const updatedProduct = await prisma.$transaction(async (tx) => {
      const updateData = {};
      const allowedFields = [
        "title",
        "description",
        "introduction",
        "basePrice",
        "stockQuantity",
        "listingStatus",
      ];

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          updateData[field] =
            field === "basePrice" || field === "stockQuantity"
              ? Number(data[field])
              : data[field];
        }
      }

      if (data.categoryId)
        updateData.category = { connect: { id: data.categoryId } };
      if (data.seriesId) updateData.series = { connect: { id: data.seriesId } };
      if (data.deviceModelId)
        updateData.deviceModel = { connect: { id: data.deviceModelId } };
      if (data.conditionId)
        updateData.condition = { connect: { id: data.conditionId } };

      // If new images are uploaded, add them to the gallery
      if (files && files.length > 0) {
        const newGalleries = files.map((file, index) => ({
          imageUrl: file.path.replace(/\\/g, "/"),
          displayOrder: index,
        }));

        updateData.productGalleries = {
          create: newGalleries,
        };
      }

      // Use Prisma's nested writes with set: [] to replace arrays efficiently
      if (parsedFaqs && Array.isArray(parsedFaqs)) {
        updateData.productFaqs = {
          deleteMany: {},
          create: parsedFaqs.map((faq) => ({
            question: faq.question,
            answer: faq.answer,
          })),
        };
      }

      if (parsedHighlights && Array.isArray(parsedHighlights)) {
        updateData.highlights = {
          deleteMany: {},
          create: parsedHighlights.map((h) => ({
            title: h.title,
            description: h.description,
            iconUrl: h.iconUrl || null,
            displayOrder: h.displayOrder || 0,
          })),
        };
      }

      if (parsedSpecs && Array.isArray(parsedSpecs)) {
        updateData.specifications = {
          deleteMany: {},
          create: parsedSpecs.map((s) => ({
            name: s.name,
            value: s.value,
            displayOrder: s.displayOrder || 0,
          })),
        };
      }

      if (parsedColors && parsedColors.length > 0) {
        updateData.colors = {
          deleteMany: {},
          create: parsedColors.map((colorId) => ({ colorId })),
        };
      }

      if (parsedStorages && parsedStorages.length > 0) {
        updateData.storageOptions = {
          deleteMany: {},
          create: parsedStorages.map((storageId) => ({
            storageOptionId: storageId,
          })),
        };
      }

      if (parsedRams && parsedRams.length > 0) {
        updateData.ramOptions = {
          deleteMany: {},
          create: parsedRams.map((ramId) => ({ ramOptionId: ramId })),
        };
      }

      // Execute the update with minimal select for fast response
      // If product doesn't exist, Prisma will throw P2025 error
      return await tx.product.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
        },
      });
    }).catch((error) => {
      // Handle Prisma P2025 error (Record not found)
      if (error.code === 'P2025') {
        throw new AppError('Product not found', 404);
      }
      throw error;
    });

    return updatedProduct;
  }

  /**
   * Delete Product (Soft delete is handled by global Prisma extension)
   */
  async deleteProduct(id) {
    // The Prisma extension will automatically intercept this and convert it to an update (isDeleted: true)
    // If product doesn't exist, Prisma will throw P2025 error
    try {
      await prisma.product.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new AppError('Product not found', 404);
      }
      throw error;
    }
  }
}

export default new ProductService();
