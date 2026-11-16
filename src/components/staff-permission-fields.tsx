import type { StaffPermissions } from '@/lib/types';
import { identityT } from '@/lib/identity-copy';
import type { UiLocale } from '@/lib/ui-i18n';

export function StaffPermissionFields({prefix,value,locale}:{prefix:string;value?:StaffPermissions|null;locale:UiLocale}){
 const t=identityT(locale);
 return <fieldset className="flex flex-col gap-3 sm:col-span-2">
  <legend className="mb-2 font-semibold">{t('Business permissions')}</legend>
  <input type="hidden" name="staffPermissionsPresent" value="1" />
  <label htmlFor={`${prefix}-catalog`} className="flex min-h-11 items-center gap-3">
   <input id={`${prefix}-catalog`} name="catalogManage" type="checkbox" value="1" defaultChecked={value?.catalogManage??true} />
   <span>{t('Manage programmes and documents')}</span>
  </label>
  <label htmlFor={`${prefix}-staff`} className="flex min-h-11 items-center gap-3">
   <input id={`${prefix}-staff`} name="staffManage" type="checkbox" value="1" defaultChecked={value?.staffManage??false} />
   <span>{t('Manage permitted Staff accounts')}</span>
  </label>
  <p className="text-sm">{t('Owner and recovery privileges cannot be delegated. Changes sign out existing sessions.')}</p>
 </fieldset>;
}
