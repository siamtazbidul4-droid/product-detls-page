import { useMemo } from 'react';
import { Building2, MapPin, Navigation, Users } from 'lucide-react';
import {
  getDistrictsByDivision,
  getDivisions,
  getUnionsByUpazila,
  getUpazilasByDistrict,
} from '../../../shared/bangladeshLocations.ts';
import { SearchableLocationDropdown } from './SearchableLocationDropdown.tsx';

export interface BangladeshLocationValue {
  divisionCode: string;
  districtCode: string;
  upazilaCode: string;
  areaCode: string;
}

interface BangladeshLocationSelectorProps {
  value: BangladeshLocationValue;
  onChange: (next: BangladeshLocationValue) => void;
  errors?: Partial<Record<keyof BangladeshLocationValue, string>>;
  idPrefix?: string;
}

export function BangladeshLocationSelector({
  value,
  onChange,
  errors,
  idPrefix = 'bd',
}: BangladeshLocationSelectorProps) {
  const divisions = useMemo(() => getDivisions(), []);
  const districts = useMemo(
    () => (value.divisionCode ? getDistrictsByDivision(value.divisionCode) : []),
    [value.divisionCode]
  );
  const upazilas = useMemo(
    () => (value.districtCode ? getUpazilasByDistrict(value.districtCode) : []),
    [value.districtCode]
  );
  const unions = useMemo(
    () => (value.upazilaCode ? getUnionsByUpazila(value.upazilaCode) : []),
    [value.upazilaCode]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SearchableLocationDropdown
        id={`${idPrefix}-division`}
        label="Division"
        required
        placeholder="Select Division"
        searchPlaceholder="Search division (e.g. Dhaka, Sylhet)..."
        options={divisions}
        value={value.divisionCode}
        onChange={(nextDivisionCode) => {
          onChange({
            divisionCode: nextDivisionCode,
            districtCode: '',
            upazilaCode: '',
            areaCode: '',
          });
        }}
        error={errors?.divisionCode}
        icon={<MapPin className="w-4 h-4" />}
      />

      <SearchableLocationDropdown
        id={`${idPrefix}-district`}
        label="District"
        required
        placeholder={value.divisionCode ? 'Select District' : 'Select Division first'}
        searchPlaceholder="Search district..."
        options={districts}
        value={value.districtCode}
        disabled={!value.divisionCode}
        onChange={(nextDistrictCode) => {
          onChange({
            divisionCode: value.divisionCode,
            districtCode: nextDistrictCode,
            upazilaCode: '',
            areaCode: '',
          });
        }}
        error={errors?.districtCode}
        icon={<Building2 className="w-4 h-4" />}
      />

      <SearchableLocationDropdown
        id={`${idPrefix}-upazila`}
        label="Thana / Upazila"
        required
        placeholder={value.districtCode ? 'Select Thana' : 'Select District first'}
        searchPlaceholder="Search thana or upazila..."
        options={upazilas}
        value={value.upazilaCode}
        disabled={!value.districtCode}
        onChange={(nextUpazilaCode) => {
          onChange({
            divisionCode: value.divisionCode,
            districtCode: value.districtCode,
            upazilaCode: nextUpazilaCode,
            areaCode: '',
          });
        }}
        error={errors?.upazilaCode}
        icon={<Navigation className="w-4 h-4" />}
      />

      <SearchableLocationDropdown
        id={`${idPrefix}-union`}
        label="Union / Ward"
        required
        placeholder={value.upazilaCode ? 'Select Union' : 'Select Thana first'}
        searchPlaceholder="Search union or area..."
        options={unions}
        value={value.areaCode}
        disabled={!value.upazilaCode}
        onChange={(nextAreaCode) => {
          onChange({
            ...value,
            areaCode: nextAreaCode,
          });
        }}
        error={errors?.areaCode}
        icon={<Users className="w-4 h-4" />}
      />
    </div>
  );
}
