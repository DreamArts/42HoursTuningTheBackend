alter table session add index session_value_index(value);
alter table record_comment add index record_comment_index(linked_record_id);
alter table group_member add index group_member_index(user_id);
alter table record_item_file add index record_item_file_index(linked_record_id);
