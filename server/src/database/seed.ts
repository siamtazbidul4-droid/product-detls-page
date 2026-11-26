import bcrypt from 'bcryptjs';
import { env } from '../config/env.ts';
import { connectDatabase } from './connection.ts';
import { BrandModel, CategoryModel, ProductModel } from '../modules/catalog/catalog.model.ts';
import { ensureDefaultCmsDocuments } from '../modules/cms/cms.routes.ts';
import { CouponModel } from '../modules/marketing/marketing.model.ts';
import { UserModel } from '../modules/users/user.model.ts';

export async function seedDatabaseIfNeeded(options?: { forceCatalog?: boolean }) {
  await ensureDefaultCmsDocuments();

  // Bootstrap Super Admin from environment variables if specified and not present
  if (env.superAdminEmail && env.superAdminPassword) {
    const existingAdmin = await UserModel.findOne({ email: env.superAdminEmail });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(env.superAdminPassword, 12);
      await UserModel.create({
        name: 'NOVARA Super Admin',
        email: env.superAdminEmail,
        passwordHash,
        role: 'super_admin',
        emailVerified: true,
        isActive: true,
      });
    }
  }

  const existingProducts = await ProductModel.countDocuments();
  if (existingProducts > 0 && !options?.forceCatalog) {
    return { categoriesCreated: 0, brandsCreated: 0, productsCreated: 0, skipped: true };
  }

  const categoryDefs = [
    {
      name: 'Smartphones',
      nameBn: 'স্মার্টফোন',
      slug: 'smartphones',
      displayOrder: 1,
      imageUrl: '/src/assets/images/product_smartphone_pro_1795621230630.jpg',
    },
    {
      name: 'Laptops',
      nameBn: 'ল্যাপটপ',
      slug: 'laptops',
      displayOrder: 2,
      imageUrl: '/src/assets/images/promo_tech_laptops_1795621230990.jpg',
    },
    {
      name: 'Fashion',
      nameBn: 'ফ্যাশন ও পোশাক',
      slug: 'fashion',
      displayOrder: 3,
      imageUrl: '/src/assets/images/promo_fashion_bundle_1795621230765.jpg',
    },
    {
      name: 'Home & Living',
      nameBn: 'হোম ও লিভিং',
      slug: 'home-living',
      displayOrder: 4,
      imageUrl: '/src/assets/images/product_backpack_sneaker_1795621232726.jpg',
    },
    {
      name: 'Beauty & Care',
      nameBn: 'বিউটি ও স্কিনকেয়ার',
      slug: 'beauty-care',
      displayOrder: 5,
      imageUrl: '/src/assets/images/product_wireless_earbuds_1795621231733.jpg',
    },
    {
      name: 'Sports',
      nameBn: 'খেলাধুলা',
      slug: 'sports',
      displayOrder: 6,
      imageUrl: '/src/assets/images/product_smartwatch_black_1795621232296.jpg',
    },
    {
      name: 'Books',
      nameBn: 'বই ও শিক্ষা',
      slug: 'books',
      displayOrder: 7,
      imageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
    },
    {
      name: 'Accessories',
      nameBn: 'অ্যাক্সেসরিজ',
      slug: 'accessories',
      displayOrder: 8,
      imageUrl: '/src/assets/images/promo_electronics_bundle_1795621230553.jpg',
    },
  ];

  const catMap = new Map<string, string>();
  let categoriesCreated = 0;
  for (const cat of categoryDefs) {
    let doc = await CategoryModel.findOne({ slug: cat.slug });
    if (!doc) {
      doc = await CategoryModel.create({
        name: cat.name,
        nameBn: cat.nameBn,
        slug: cat.slug,
        displayOrder: cat.displayOrder,
        isActive: true,
        image: { publicId: `seed-${cat.slug}`, url: cat.imageUrl, alt: cat.name },
      });
      categoriesCreated += 1;
    }
    catMap.set(cat.slug, String(doc._id));
  }

  const brandDefs = [
    { name: 'Titanium Tech', slug: 'titanium-tech' },
    { name: 'Aethel Audio', slug: 'aethel-audio' },
    { name: 'Dhaka Loom', slug: 'dhaka-loom' },
    { name: 'Novara Press', slug: 'novara-press' },
    { name: 'Urbanite Gear', slug: 'urbanite-gear' },
  ];

  const brandMap = new Map<string, string>();
  let brandsCreated = 0;
  for (const b of brandDefs) {
    let doc = await BrandModel.findOne({ slug: b.slug });
    if (!doc) {
      doc = await BrandModel.create({ name: b.name, slug: b.slug, isActive: true });
      brandsCreated += 1;
    }
    brandMap.set(b.slug, String(doc._id));
  }

  const productDefs = [
    {
      name: 'Titanium Pro 5G Smartphone',
      nameBn: 'টাইটানিয়াম প্রো ৫জি স্মার্টফোন',
      slug: 'titanium-pro-5g-smartphone',
      sku: 'NVR-PHN-001',
      categorySlug: 'smartphones',
      brandSlug: 'titanium-tech',
      categoryDomain: 'electronics',
      basePrice: 118999,
      salePrice: 109999,
      stockOnHand: 24,
      isFeatured: true,
      imageUrl: '/src/assets/images/product_smartphone_pro_1795621230630.jpg',
      bilingualKeywords: ['স্মার্টফোন', 'মোবাইল', 'ফোন', 'smartphone', '5g', 'mobile'],
      attributes: {
        Brand: 'Titanium Tech',
        Storage: '256GB / 512GB',
        Warranty: '1 Year Official Bangladesh Warranty',
        Display: '6.7-inch LTPO AMOLED 120Hz',
      },
      features: ['Aerospace-grade titanium frame', '48MP triple pro camera array', 'All-day battery with 45W fast charging'],
      description: 'Flagship 5G smartphone engineered for creators and professionals across Bangladesh with official warranty support.',
      variants: [
        { sku: 'NVR-PHN-001-256', title: '256GB · Natural Titanium', options: { Storage: '256GB', Color: 'Natural Titanium' }, price: 118999, stockOnHand: 14 },
        { sku: 'NVR-PHN-001-512', title: '512GB · Obsidian Black', options: { Storage: '512GB', Color: 'Obsidian Black' }, price: 134999, stockOnHand: 10 },
      ],
    },
    {
      name: 'Aethel Studio ANC Wireless Earbuds',
      nameBn: 'এথেল ওয়্যারলেস ইয়ারবাডস',
      slug: 'aethel-studio-anc-earbuds',
      sku: 'NVR-AUD-002',
      categorySlug: 'accessories',
      brandSlug: 'aethel-audio',
      categoryDomain: 'electronics',
      basePrice: 12990,
      salePrice: 9490,
      stockOnHand: 45,
      isFeatured: true,
      imageUrl: '/src/assets/images/product_wireless_earbuds_1795621231733.jpg',
      bilingualKeywords: ['ইয়ারবাড', 'হেডফোন', 'অডিও', 'earbuds', 'anc', 'wireless'],
      attributes: {
        Connectivity: 'Bluetooth 5.3',
        Battery: '36 Hours with USB-C Case',
        Warranty: '6 Months Replacement Warranty',
      },
      features: ['Active Noise Cancellation up to 42dB', 'Dual-mic crystal call clarity', 'IPX5 sweat resistance'],
      description: 'Precision-tuned acoustic wireless earbuds with adaptive noise cancellation for Dhaka commutes and deep focus.',
      variants: [],
    },
    {
      name: 'Apex Series 10 AMOLED Smartwatch',
      nameBn: 'অ্যাপেক্স অ্যামোলেড স্মার্টওয়াচ',
      slug: 'apex-series-10-smartwatch',
      sku: 'NVR-WTC-003',
      categorySlug: 'sports',
      brandSlug: 'titanium-tech',
      categoryDomain: 'electronics',
      basePrice: 18999,
      salePrice: 14999,
      stockOnHand: 32,
      isFeatured: true,
      imageUrl: '/src/assets/images/product_smartwatch_black_1795621232296.jpg',
      bilingualKeywords: ['ঘড়ি', 'স্মার্টওয়াচ', 'watch', 'smartwatch', 'fitness'],
      attributes: {
        Display: '1.92-inch Always-On AMOLED',
        WaterResistance: '5ATM Swim-Proof',
        Battery: 'Up to 10 Days',
      },
      features: ['Heart rate & SpO2 monitoring', 'Built-in dual-band GPS', 'Bluetooth calling support'],
      description: 'Matte aluminum fitness and productivity smartwatch built for everyday tracking and outdoor endurance.',
      variants: [],
    },
    {
      name: 'Urbanite Weatherproof Commuter Backpack',
      nameBn: 'আরবানাইট কমিউটার ব্যাকপ্যাক',
      slug: 'urbanite-commuter-backpack',
      sku: 'NVR-BAG-004',
      categorySlug: 'home-living',
      brandSlug: 'urbanite-gear',
      categoryDomain: 'home_lifestyle',
      basePrice: 4999,
      salePrice: 3999,
      stockOnHand: 50,
      isFeatured: true,
      imageUrl: '/src/assets/images/product_backpack_sneaker_1795621232726.jpg',
      bilingualKeywords: ['ব্যাগ', 'ব্যাকপ্যাক', 'backpack', 'laptop bag', 'travel'],
      attributes: {
        Material: 'Water-Resistant Ballistic Nylon',
        Capacity: '24 Liters (Fits 16-inch Laptop)',
        Dimensions: '46cm x 31cm x 16cm',
      },
      features: ['Padded 16-inch laptop sleeve', 'Hidden passport & wallet pocket', 'Breathable ergonomic back panel'],
      description: 'Minimalist monsoon-ready commuter backpack designed for students and working professionals.',
      variants: [],
    },
    {
      name: 'Heavyweight Organic Cotton Hoodie & Sneaker Kit',
      nameBn: 'কটন হুডি ও স্নিকার্স কালেকশন',
      slug: 'heavyweight-cotton-hoodie-bundle',
      sku: 'NVR-FSH-005',
      categorySlug: 'fashion',
      brandSlug: 'dhaka-loom',
      categoryDomain: 'fashion',
      basePrice: 5490,
      salePrice: 3890,
      stockOnHand: 40,
      isFeatured: true,
      imageUrl: '/src/assets/images/promo_fashion_bundle_1795621230765.jpg',
      bilingualKeywords: ['হুডি', 'পোশাক', 'ফ্যাশন', 'জুতা', 'hoodie', 'fashion', 'apparel'],
      attributes: {
        Fabric: '400GSM Combed Ring-Spun Cotton',
        Origin: 'Crafted in Bangladesh',
        Care: 'Machine wash cold, tumble dry low',
      },
      features: ['Export-grade Bangladeshi cotton', 'Pre-shrunk tailored silhouette', 'Reinforced double-stitch seams'],
      description: 'Premium export-quality heavyweight hoodie tailored for comfort across cool evenings.',
      variants: [
        { sku: 'NVR-FSH-005-M', title: 'Medium · Sand Beige', options: { Size: 'M', Color: 'Sand Beige' }, price: 3890, stockOnHand: 20 },
        { sku: 'NVR-FSH-005-L', title: 'Large · Deep Navy', options: { Size: 'L', Color: 'Deep Navy' }, price: 3890, stockOnHand: 20 },
      ],
    },
    {
      name: 'Atomic Habits & Deep Focus Motivational Books Set',
      nameBn: 'মোটিভেশনাল বই সংগ্রহ',
      slug: 'motivational-books-focus-set',
      sku: 'NVR-BOK-006',
      categorySlug: 'books',
      brandSlug: 'novara-press',
      categoryDomain: 'books',
      basePrice: 1450,
      salePrice: 1150,
      stockOnHand: 65,
      isFeatured: true,
      imageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
      bilingualKeywords: ['মোটিভেশনাল বই', 'মোটিভেশনাল', 'বই', 'অনুপ্রেরণামূলক', 'motivational books', 'self-help'],
      attributes: {
        Author: 'Curated International & Bangla Edition',
        ISBN: '978-984-0001-24-5',
        Publisher: 'Novara Press Dhaka',
        Language: 'English / Bangla Companion',
        Format: 'Paperback Premium Matte',
      },
      features: ['High-opacity cream reading paper', 'Actionable habit scorecards included', 'Original authorized print edition'],
      description: 'Bestselling motivational books curated for students, entrepreneurs, and lifelong learners in Bangladesh.',
      variants: [],
    },
    {
      name: 'AeroBook 14 M-Series Ultrabook Laptop',
      nameBn: 'অ্যারোবুক ১৪ আল্ট্রাবুক ল্যাপটপ',
      slug: 'aerobook-14-ultrabook-laptop',
      sku: 'NVR-LPT-007',
      categorySlug: 'laptops',
      brandSlug: 'titanium-tech',
      categoryDomain: 'electronics',
      basePrice: 138000,
      salePrice: 126500,
      stockOnHand: 12,
      isFeatured: true,
      imageUrl: '/src/assets/images/promo_tech_laptops_1795621230990.jpg',
      bilingualKeywords: ['ল্যাপটপ', 'কম্পিউটার', 'নোটবুক', 'laptop', 'ultrabook'],
      attributes: {
        Processor: '12-Core Performance Architecture',
        Memory: '16GB Unified RAM · 512GB NVMe SSD',
        Warranty: '2 Years Official Service Warranty',
      },
      features: ['14.2-inch Liquid IPS anti-glare display', '18-hour battery life', 'Aluminum unibody chassis (1.24kg)'],
      description: 'Featherweight productivity laptop built for software engineers, designers, and university students.',
      variants: [],
    },
  ];

  let productsCreated = 0;
  for (const p of productDefs) {
    const exists = await ProductModel.exists({ sku: p.sku });
    if (exists) continue;

    await ProductModel.create({
      name: p.name,
      nameBn: p.nameBn,
      slug: p.slug,
      sku: p.sku,
      categoryId: catMap.get(p.categorySlug),
      brandId: brandMap.get(p.brandSlug),
      categoryDomain: p.categoryDomain,
      description: p.description,
      shortDescription: p.description,
      features: p.features,
      attributes: p.attributes,
      bilingualKeywords: p.bilingualKeywords,
      basePrice: p.basePrice,
      salePrice: p.salePrice,
      stockOnHand: p.stockOnHand,
      variants: p.variants,
      images: [{ publicId: `seed-${p.sku}`, url: p.imageUrl, alt: p.name }],
      status: 'published',
      isFeatured: p.isFeatured,
      codEligible: true,
      warrantyInfo: p.attributes.Warranty || '7 Days Easy Replacement',
      returnPolicyInfo: '7 Days Easy Return on unused items in original packaging.',
    });
    productsCreated += 1;
  }

  // Create welcome coupon if missing
  const couponExists = await CouponModel.exists({ code: 'NOVARA10' });
  if (!couponExists) {
    await CouponModel.create({
      code: 'NOVARA10',
      description: '10% off on orders over ৳1,500 (capped at ৳1,000)',
      type: 'percentage',
      value: 10,
      maxDiscountCap: 1000,
      minOrderAmount: 1500,
      isActive: true,
    });
  }

  return { categoriesCreated, brandsCreated, productsCreated, skipped: false };
}

// Allow running directly via `npm run seed`
const isDirectRun = process.argv[1]?.endsWith('seed.ts');
if (isDirectRun) {
  connectDatabase()
    .then(async (connected) => {
      if (!connected) {
        console.error('[Seed] Cannot seed: MONGODB_URI is not configured or Atlas is unreachable.');
        process.exit(1);
      }
      const res = await seedDatabaseIfNeeded({ forceCatalog: true });
      console.log('[Seed] Completed:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}
