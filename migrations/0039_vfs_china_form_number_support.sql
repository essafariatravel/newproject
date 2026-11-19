-- Accept either the VFS certificate voucher (ALG...) or the numeric
-- Application Form No. already available earlier during online submission.
alter table vfs_china_bindings drop constraint if exists vfs_china_reference_format;
alter table vfs_china_bindings add constraint vfs_china_reference_format
  check (vfs_reference ~ '^ALG[A-Z0-9]{10,26}$' or
         vfs_reference ~ '^[0-9]{12,24}$');
