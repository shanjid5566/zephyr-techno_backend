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
   * - Groups variants into unique conditions, colors, storageOptions, ramOptions
   * - Removes internal soft-delete fields
   * - Formats image URLs
   */
  #formatProduct(product) {
    const variants = product.productVariants || [];

    // Extract unique options from all variants using Maps to deduplicate by ID
    const conditionMap = new Map();
    const colorMap = new Map();
    const storageMap = new Map();
    const ramMap = new Map();

    for (const v of variants) {
      if (v.condition && !conditionMap.has(v.conditionId)) {
        conditionMap.set(v.conditionId, {
          id: v.conditionId,
          name: v.condition.name,
        });
      }
      if (v.color && !colorMap.has(v.colorId)) {
        colorMap.set(v.colorId, { id: v.colorId, name: v.color.name });
      }
      if (v.storageOption && !storageMap.has(v.storageOptionId)) {
        storageMap.set(v.storageOptionId, {
          id: v.storageOptionId,
          name: v.storageOption.name,
        });
      }
      if (v.ramOption && !ramMap.has(v.ramOptionId)) {
        ramMap.set(v.ramOptionId, {
          id: v.ramOptionId,
          name: v.ramOption.name,
        });
      }
    }

    // Format variants (strip soft-delete internals)
    const formattedVariants = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      finalPrice: v.finalPrice,
      stockQuantity: v.stockQuantity,
      variantStatus: v.variantStatus,
      conditionId: v.conditionId,
      colorId: v.colorId,
      storageOptionId: v.storageOptionId,
      ramOptionId: v.ramOptionId,
    }));

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      introduction: product.introduction,
      basePrice: product.basePrice,
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

      // Grouped unique options (for frontend selectors)
      availableConditions: [...conditionMap.values()],
      availableColors: [...colorMap.values()],
      availableStorageOptions: [...storageMap.values()],
      availableRamOptions: [...ramMap.values()],

      // All raw variant combinations (for frontend to resolve selections)
      variants: formattedVariants,
      totalVariants: formattedVariants.length,
    };
  }

  /**
   * Lightweight formatter for list/card views (admin product grid).
   * Returns only what is needed to render a product card.
   */
  #formatProductCard(product) {
    const variants = product.productVariants || [];
    // Use the first variant as the representative for the card display
    const firstVariant = variants[0] || null;

    // First image as thumbnail
    const thumbnail = product.productGalleries?.[0]
      ? buildImageUrl(product.productGalleries[0].imageUrl)
      : null;

    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
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
      // Condition badge from the first variant
      condition: firstVariant?.condition ?? null,
      // Representative storage & RAM from the first variant (for the card subtitle)
      storage: firstVariant?.storageOption ?? null,
      ram: firstVariant?.ramOption ?? null,
      // Representative price & stock
      price: firstVariant?.finalPrice ?? product.basePrice,
      stockQuantity: firstVariant?.stockQuantity ?? 0,
      totalVariants: variants.length,
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
      listingStatus,
      categoryId,
      seriesId,
      deviceModelId,
      faqs,
      conditionId,
      stockQuantity,
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
        imageUrl: file.path.replace(/\\/g, "/"), // store relative path
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

    // Helper to safely parse JSON arrays from form-data
    const parseArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch (e) {
        return [val];
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

    const variantsData = [];
    const parsedStock = parseInt(stockQuantity) || 0;
    const parsedPrice = Number(basePrice);

    for (const color of colors) {
      for (const storage of storages) {
        for (const ram of rams) {
          variantsData.push({
            // Use scalar IDs directly - avoids Prisma FK pre-validation (saves ~32 queries)
            conditionId,
            colorId: color,
            storageOptionId: storage,
            ramOptionId: ram,
            finalPrice: parsedPrice,
            stockQuantity: parsedStock,
            sku: `SKU-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          });
        }
      }
    }

    // Use a transaction to:
    // 1. Create product + galleries + FAQs in one query
    // 2. Bulk-insert all variants with createMany (1 query regardless of count)
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title,
          description,
          introduction,
          basePrice: parsedPrice,
          listingStatus: listingStatus || "INACTIVE",
          categoryId,
          seriesId,
          deviceModelId,
          productGalleries: { create: productGalleries },
          productFaqs: { create: productFaqs },
        },
        select: {
          id: true,
          title: true,
          basePrice: true,
          listingStatus: true,
          categoryId: true,
          seriesId: true,
          deviceModelId: true,
          createdAt: true,
          productGalleries: {
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { imageUrl: true },
          },
        },
      });

      // Bulk insert variants — createMany is a single INSERT statement
      await tx.productVariant.createMany({
        data: variantsData.map((v) => ({ ...v, productId: created.id })),
      });

      return created;
    });

    // Return a lightweight card response — no need to re-fetch all 8 variants
    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
      listingStatus: product.listingStatus,
      categoryId: product.categoryId,
      seriesId: product.seriesId,
      deviceModelId: product.deviceModelId,
      thumbnail: product.productGalleries[0]
        ? buildImageUrl(product.productGalleries[0].imageUrl)
        : null,
      totalVariants: variantsData.length,
      createdAt: product.createdAt,
    };
  }

  /**
   * Get all products with optional filters
   */
  async getAllProducts(query) {
    const { categoryId, listingStatus, conditionId } = query;

    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (listingStatus) where.listingStatus = listingStatus;

    // Condition is on ProductVariant, so we filter products that have a variant with this condition
    if (conditionId) {
      where.productVariants = {
        some: {
          conditionId: conditionId,
        },
      };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        // Only first gallery image needed for the thumbnail
        productGalleries: {
          orderBy: { displayOrder: "asc" },
          take: 1,
        },
        productVariants: {
          // Only first variant for the card summary (condition/storage/ram/price/stock)
          take: 1,
          orderBy: { createdAt: "asc" },
          include: {
            condition: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
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
        productGalleries: true,
        productFaqs: true,
        highlights: true,
        specifications: true,
        productVariants: {
          include: {
            condition: { select: { id: true, name: true } },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
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
    // Check existence
    const existingProduct = await this.getProductById(id);

    const updateData = {};
    const allowedFields = [
      "title",
      "description",
      "introduction",
      "basePrice",
      "listingStatus",
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] =
          field === "basePrice" ? Number(data[field]) : data[field];
      }
    }

    if (data.categoryId)
      updateData.category = { connect: { id: data.categoryId } };
    if (data.seriesId) updateData.series = { connect: { id: data.seriesId } };
    if (data.deviceModelId)
      updateData.deviceModel = { connect: { id: data.deviceModelId } };

    // If new images are uploaded, add them to the gallery
    if (files && files.length > 0) {
      const newGalleries = files.map((file, index) => ({
        imageUrl: file.path.replace(/\\/g, "/"),
        displayOrder: index, // We might need better displayOrder logic in production
      }));

      updateData.productGalleries = {
        create: newGalleries,
      };
    }

    // Process FAQs if provided. We overwrite existing ones.
    if (data.faqs !== undefined) {
      try {
        const parsedFaqs =
          typeof data.faqs === "string" ? JSON.parse(data.faqs) : data.faqs;
        if (Array.isArray(parsedFaqs)) {
          // Delete old FAQs and create new ones
          await prisma.productFaq.deleteMany({ where: { productId: id } });
          updateData.productFaqs = {
            create: parsedFaqs.map((faq) => ({
              question: faq.question,
              answer: faq.answer,
            })),
          };
        }
      } catch (err) {
        throw new AppError(
          "Invalid FAQs format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Process Variants if variant-related fields are provided
    if (
      data.conditionId ||
      data.colorIds ||
      data.storageOptionIds ||
      data.ramOptionIds
    ) {
      // Helper to safely parse JSON arrays from form-data
      const parseArray = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        try {
          return JSON.parse(val);
        } catch (e) {
          return [val];
        }
      };

      const colors = parseArray(data.colorIds);
      const storages = parseArray(data.storageOptionIds);
      const rams = parseArray(data.ramOptionIds);

      if (colors.length === 0 || storages.length === 0 || rams.length === 0) {
        throw new AppError(
          "At least one Color, Storage Option, and RAM Option must be selected when updating variants.",
          400,
        );
      }

      const variantsData = [];
      const parsedStock = parseInt(data.stockQuantity) || 0;
      // Use the new basePrice if provided, else keep existing
      const parsedPrice =
        data.basePrice !== undefined
          ? Number(data.basePrice)
          : Number(existingProduct.basePrice);
      // Require conditionId if recreating variants
      const condId =
        data.conditionId || existingProduct.productVariants?.[0]?.conditionId;

      if (!condId) {
        throw new AppError(
          "conditionId is required to recreate variants.",
          400,
        );
      }

      for (const color of colors) {
        for (const storage of storages) {
          for (const ram of rams) {
            variantsData.push({
              finalPrice: parsedPrice,
              stockQuantity: parsedStock,
              sku: `SKU-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
              condition: { connect: { id: condId } },
              color: { connect: { id: color } },
              storageOption: { connect: { id: storage } },
              ramOption: { connect: { id: ram } },
            });
          }
        }
      }

      // Delete old variants
      await prisma.productVariant.deleteMany({ where: { productId: id } });

      updateData.productVariants = {
        create: variantsData,
      };
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        productGalleries: true,
        productFaqs: true,
        highlights: true,
        specifications: true,
        productVariants: {
          include: {
            condition: { select: { id: true, name: true } },
            color: { select: { id: true, name: true } },
            storageOption: { select: { id: true, name: true } },
            ramOption: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.#formatProduct(updatedProduct);
  }

  /**
   * Delete Product (Soft delete is handled by global Prisma extension)
   */
  async deleteProduct(id) {
    // Verify existence
    await this.getProductById(id);

    // The Prisma extension will automatically intercept this and convert it to an update (isDeleted: true)
    await prisma.product.delete({
      where: { id },
    });

    return true;
  }
}

export default new ProductService();
