ALTER TABLE session ADD INDEX session_value_index (value);

-- ALTER TABLE group_member ADD INDEX group_member_user_id_index (user_id);
-- ALTER TABLE record ADD INDEX record_record_id_index (record_id);
ALTER TABLE user ADD INDEX user_user_id_index (user_id);
ALTER TABLE group_info ADD group_info_group_id_index INDEX (group_id);
ALTER TABLE file ADD INDEX file_file_id_index (file_id);
-- ALTER TABLE category ADD INDEX category_category_id_index (category_id);
-- ALTER TABLE category_group ADD category_group_group_id_index INDEX (group_id);
ALTER TABLE record ADD INDEX record_status_index (status);
ALTER TABLE record_comment ADD INDEX record_comment_linked_record_id_index (linked_record_id);
ALTER TABLE record_last_access ADD INDEX record_last_access_user_id_index (user_id);
ALTER TABLE record ADD INDEX record_created_by (created_by);
