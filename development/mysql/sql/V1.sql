ALTER TABLE session ADD INDEX index_session (value);
ALTER TABLE record_comment ADD INDEX index_record_comment (linked_record_id);

