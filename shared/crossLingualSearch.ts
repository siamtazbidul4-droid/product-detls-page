const CROSS_LINGUAL_SYNONYMS: Array<[string[], string[]]> = [
  [['মোটিভেশনাল', 'অনুপ্রেরণামূলক', 'উন্নয়নমূলক'], ['motivational', 'self-help', 'inspiration']],
  [['বই', 'পুস্তক', 'কিতাব', 'boi'], ['book', 'books', 'literature', 'reading']],
  [['গল্প', 'উপন্যাস', 'golpo', 'uponnyash'], ['fiction', 'novel', 'story']],
  [['স্মার্টফোন', 'মোবাইল', 'ফোন', 'mobile', 'phone'], ['smartphone', 'phone', 'mobile', 'iphone', 'android']],
  [['ল্যাপটপ', 'কম্পিউটার', 'নোটবুক'], ['laptop', 'notebook', 'computer', 'ultrabook']],
  [['ঘড়ি', 'স্মার্টওয়াচ', 'ghori'], ['watch', 'smartwatch', 'timepiece']],
  [['হেডফোন', 'ইয়ারবাড', 'ইয়ারফোন'], ['headphones', 'earbuds', 'audio', 'earphone']],
  [['স্পিকার', 'সাউন্ড'], ['speaker', 'audio', 'bluetooth']],
  [['ব্যাগ', 'ব্যাকপ্যাক'], ['backpack', 'bag', 'commuter']],
  [['জুতা', 'স্নিকার্স', 'juta'], ['shoes', 'sneakers', 'footwear']],
  [['টি-শার্ট', 'জামা', 'পোশাক', 'ফ্যাশন', 'হুডি', 'jama'], ['t-shirt', 'hoodie', 'fashion', 'apparel', 'shirt']],
  [['স্কিনকেয়ার', 'ত্বক', 'সৌন্দর্য', 'সাবান', 'সিরাম', 'ক্রিম'], ['skincare', 'serum', 'beauty', 'cream', 'cleanser']],
  [['খেলাধুলা', 'ফুটবল', 'ক্রিকেট', 'ব্যাট'], ['sports', 'football', 'cricket', 'fitness']],
  [['ঘর', 'হোম', 'সোফা', 'আসবাব', 'লাইট'], ['home', 'living', 'furniture', 'lamp', 'decor']],
  [['ইলেকট্রনিক্স', 'গ্যাজেট'], ['electronics', 'gadget', 'tech']],
];

export function expandCrossLingualTokens(rawQuery: string): string[] {
  const cleaned = rawQuery
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ');

  const baseTokens = cleaned.split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(baseTokens);

  for (const [bnTerms, enTerms] of CROSS_LINGUAL_SYNONYMS) {
    const allTerms = [...bnTerms, ...enTerms];
    const matched = baseTokens.some((token) =>
      allTerms.some((term) => term === token || (token.length >= 3 && term.includes(token)))
    );
    if (matched) {
      for (const term of allTerms) {
        expanded.add(term);
      }
    }
  }

  return Array.from(expanded);
}
