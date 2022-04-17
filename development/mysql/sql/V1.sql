ALTER TABLE record_item_file ADD INDEX (linked_record_id, item_id);
ALTER TABLE record_last_access ADD INDEX (user_id, record_id);
ALTER TABLE record ADD INDEX (status);
ALTER TABLE record ADD INDEX (created_by, status, updated_at);
ALTER TABLE record_comment ADD INDEX (linked_record_id, created_at);
ALTER TABLE record ADD INDEX (status, category_id, application_group);
ALTER TABLE record ADD INDEX (status, updated_at, record_id);
