/** Shared persisted-proof predicate for presentation, warnings and repair.
 * Aliases are internal SQL relation names, never values supplied by a user. */
export function officialDocumentIntegritySql(documentAlias: string, blobAlias: string): string {
  for (const alias of [documentAlias, blobAlias]) if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error("Invalid internal relation alias.");
  const d = `"${documentAlias}"`, b = `"${blobAlias}"`;
  return `${d}.status='ACCEPTED' and ${d}.uploaded_by is not null
    and ${d}.reviewed_by is not null and ${d}.reviewed_at is not null
    and ${d}.applicant_id is null and ${d}.checklist_item_id is null
    and ${d}.size_bytes between 1 and 2097152
    and ${b}.size_bytes=${d}.size_bytes and octet_length(${b}.data)=${d}.size_bytes
    and ${b}.mime_type=${d}.mime_type
    and ((${d}.mime_type='application/pdf' and substring(${b}.data from 1 for 5)=decode('255044462d','hex'))
      or (${d}.mime_type='image/jpeg' and substring(${b}.data from 1 for 3)=decode('ffd8ff','hex'))
      or (${d}.mime_type='image/png' and substring(${b}.data from 1 for 8)=decode('89504e470d0a1a0a','hex')))`;
}
