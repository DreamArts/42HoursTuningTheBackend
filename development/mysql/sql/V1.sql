ALTER TABLE session ADD INDEX index_t9 (value);
ALTER TABLE user ADD INDEX index_t9 (name);
ALTER TABLE group_info ADD INDEX index_t9 (name);
ALTER TABLE record_item_file ADD INDEX index_t9 (item_id);
ALTER TABLE record_last_access ADD INDEX index_t9 (access_time);