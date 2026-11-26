import {
  districts_en,
  divisions_en,
  unions_en,
  upazilas_en,
  type LocationItem,
} from 'bangladesh-location-data';

export type BangladeshZone = 'dhaka_metro' | 'dhaka_suburb' | 'outside_dhaka';

export interface LocationOption {
  code: string;
  name: string;
}

export interface ValidatedHierarchy {
  valid: boolean;
  divisionName?: string;
  districtName?: string;
  upazilaName?: string;
  areaName?: string;
  zone?: BangladeshZone;
}

const UPPERCASE_WORDS = new Set(['epz', 'bscic']);

export function formatLocationTitle(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      if (UPPERCASE_WORDS.has(word.toLowerCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function toOptions(items: LocationItem[] | undefined): LocationOption[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => ({
    code: String(item.value),
    name: formatLocationTitle(item.title),
  }));
}

export const DEFAULT_BD_LOCATION = {
  divisionCode: '30', // Dhaka
  districtCode: '26', // Dhaka
  upazilaCode: '492', // Dhaka South City Corporation
  areaCode: '4654', // Dhanmondi
};

const DIVISION_MAP = new Map<string, LocationOption>(
  divisions_en.map((d) => [String(d.value), { code: String(d.value), name: formatLocationTitle(d.title) }])
);

const DISTRICT_TO_DIVISION = new Map<string, string>();
for (const [divCode, list] of Object.entries(districts_en)) {
  for (const dist of list) {
    DISTRICT_TO_DIVISION.set(String(dist.value), divCode);
  }
}

const UPAZILA_TO_DISTRICT = new Map<string, string>();
for (const [distCode, list] of Object.entries(upazilas_en)) {
  for (const upa of list) {
    UPAZILA_TO_DISTRICT.set(String(upa.value), distCode);
  }
}

export function getDivisions(): LocationOption[] {
  return toOptions(divisions_en);
}

export function getDistrictsByDivision(divisionCode: string): LocationOption[] {
  return toOptions(districts_en[divisionCode]);
}

export function getUpazilasByDistrict(districtCode: string): LocationOption[] {
  return toOptions(upazilas_en[districtCode]);
}

export function getUnionsByUpazila(upazilaCode: string): LocationOption[] {
  const list = toOptions(unions_en[upazilaCode]);
  if (list.length > 0) return list;

  // Handle the single upazila in the dataset without child union entries (e.g. Shayestagonj Pourashava)
  const parentDistCode = UPAZILA_TO_DISTRICT.get(upazilaCode);
  if (!parentDistCode) return [];
  const upazila = (upazilas_en[parentDistCode] || []).find((u) => String(u.value) === upazilaCode);
  if (!upazila) return [];

  return [
    {
      code: `pourashava-${upazilaCode}`,
      name: `${formatLocationTitle(upazila.title)} Pourashava`,
    },
  ];
}

const DHAKA_DISTRICT_CODE = '26';
const DHAKA_METRO_UPAZILA_CODES = new Set(['492', '493']); // Dhaka South & North City Corporations
const DHAKA_SUBURB_DISTRICT_CODES = new Set(['33', '67']); // Gazipur, Narayanganj

export function resolveZoneFromLocation(
  districtCode: string,
  upazilaCode?: string
): BangladeshZone {
  if (districtCode === DHAKA_DISTRICT_CODE) {
    if (!upazilaCode || DHAKA_METRO_UPAZILA_CODES.has(upazilaCode)) {
      return 'dhaka_metro';
    }
    return 'dhaka_suburb';
  }
  if (DHAKA_SUBURB_DISTRICT_CODES.has(districtCode)) {
    return 'dhaka_suburb';
  }
  return 'outside_dhaka';
}

export function validateBangladeshHierarchy(input: {
  divisionCode: string;
  districtCode: string;
  upazilaCode: string;
  areaCode: string;
}): ValidatedHierarchy {
  const division = DIVISION_MAP.get(input.divisionCode);
  if (!division) return { valid: false };

  const districts = getDistrictsByDivision(input.divisionCode);
  const district = districts.find((d) => d.code === input.districtCode);
  if (!district) return { valid: false };

  const upazilas = getUpazilasByDistrict(input.districtCode);
  const upazila = upazilas.find((u) => u.code === input.upazilaCode);
  if (!upazila) return { valid: false };

  const unions = getUnionsByUpazila(input.upazilaCode);
  const union = unions.find((a) => a.code === input.areaCode);
  if (!union) return { valid: false };

  return {
    valid: true,
    divisionName: division.name,
    districtName: district.name,
    upazilaName: upazila.name,
    areaName: union.name,
    zone: resolveZoneFromLocation(district.code, upazila.code),
  };
}

export function isValidBangladeshPhone(phone: string): boolean {
  const compact = phone.replace(/[\s\-()]/g, '');
  return /^(?:\+?880|0)?1[3-9]\d{8}$/.test(compact);
}

export function normalizeBangladeshPhone(phone: string): string {
  const compact = phone.replace(/[\s\-()]/g, '');
  if (/^\+8801[3-9]\d{8}$/.test(compact)) return compact;
  if (/^8801[3-9]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^01[3-9]\d{8}$/.test(compact)) return compact;
  if (/^1[3-9]\d{8}$/.test(compact)) return `0${compact}`;
  return phone.trim();
}
