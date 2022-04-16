ALTER TABLE record_comment ADD INDEX index_tome(linked_record_id);
ALTER TABLE record ADD INDEX index_tome(status, category_id, application_group);
ALTER TABLE record_item_file ADD INDEX index_3(linked_record_id);
ALTER TABLE session ADD INDEX session_index(value);
