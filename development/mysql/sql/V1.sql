create index session_idx on session (value);
create index record_status_idx on record (status);
create index record_idx on record (record_id);
create index linked_record_id_idx on record_item_file (linked_record_id);
