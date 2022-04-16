const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const log4js = require('log4js')

log4js.configure({
	appenders : {
	system : {type : 'file', filename : '../log/api.log'}
	},
	categories : {
	default : {appenders : ['system'], level : 'info'},
	}
});

const logger = log4js.getLogger('system');
const jimp = require('jimp');

const mysql = require('mysql2/promise');


// MEMO: 設定項目はここを参考にした
// https://github.com/sidorares/node-mysql2#api-and-configuration
// https://github.com/mysqljs/mysql
const mysqlOption = {
  host: 'mysql',
  user: 'backend',
  password: 'backend',
  database: 'app',
  waitForConnections: true,
  connectionLimit: 10,
};
const pool = mysql.createPool(mysqlOption);

const mylog_1 = (obj) => {
  if (Array.isArray(obj)) {
    for (const e of obj) {
      console.log(e);
    }
    return;
  }
  console.log(obj);
  logger.info(obj);
};

const getLinkedUser = async (headers) => {
  const target = headers['x-app-key'];
  mylog_1(target);
  const qs = `select * from session where value = ?`;

  const [rows] = await pool.query(qs, [`${target}`]);

  if (rows.length !== 1) {
    mylog_1('セッションが見つかりませんでした。');
    return undefined;
  }

  return { user_id: rows[0].linked_user_id };
};

const filePath = 'file/';

// POST /records
// 申請情報登録
const postRecords = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  mylog_1(user);

  const body = req.body;
  mylog_1(body);

  let [rows] = await pool.query(
    `select * from group_member where user_id = ?
    AND is_primary = true`,
    [user.user_id],
  );

  if (rows.length !== 1) {
    mylog_1('申請者のプライマリ組織の解決に失敗しました。');
    res.status(400).send();
    return;
  }

  const userPrimary = rows[0];

  mylog_1(userPrimary);

  const newId = uuidv4();

  await pool.query(
    `insert into record
    (record_id, status, title, detail, category_id, application_group, created_by, created_at, updated_at)
    values (?, "open", ?, ?, ?, ?, ?, now(), now())`,
    [
      `${newId}`,
      `${body.title}`,
      `${body.detail}`,
      body.categoryId,
      userPrimary.group_id,
      user.user_id,
    ],
  );

  for (const e of body.fileIdList) {
    await pool.query(
      `insert into record_item_file
        (linked_record_id, linked_file_id, linked_thumbnail_file_id, created_at)
        values (?, ?, ?, now())`,
      [`${newId}`, `${e.fileId}`, `${e.thumbFileId}`],
    );
  }

  res.send({ recordId: newId });
};

// GET /records/{recordId}
// 文書詳細取得
const getRecord = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;

  const recordQs = `select * from record where record_id = ?`;

  const [recordResult] = await pool.query(recordQs, [`${recordId}`]);
  mylog_1(recordResult);

  if (recordResult.length !== 1) {
    res.status(404).send({});
    return;
  }

  let recordInfo = {
    recordId: '',
    status: '',
    title: '',
    detail: '',
    categoryId: null,
    categoryName: '',
    applicationGroup: '',
    applicationGroupName: null,
    createdBy: null,
    createdByName: null,
    createdByPrimaryGroupName: null,
    createdAt: null,
    files: [],
  };

  const searchPrimaryGroupQs = `select * from group_member where user_id = ? and is_primary = true`;
  const searchUserQs = `select * from user where user_id = ?`;
  const searchGroupQs = `select * from group_info where group_id = ?`;
  const searchCategoryQs = `select * from category where category_id = ?`;

  const line = recordResult[0];

  const [primaryResult] = await pool.query(searchPrimaryGroupQs, [line.created_by]);
  if (primaryResult.length === 1) {
    const primaryGroupId = primaryResult[0].group_id;

    const [groupResult] = await pool.query(searchGroupQs, [primaryGroupId]);
    if (groupResult.length === 1) {
      recordInfo.createdByPrimaryGroupName = groupResult[0].name;
    }
  }

  const [appGroupResult] = await pool.query(searchGroupQs, [line.application_group]);
  if (appGroupResult.length === 1) {
    recordInfo.applicationGroupName = appGroupResult[0].name;
  }

  const [userResult] = await pool.query(searchUserQs, [line.created_by]);
  if (userResult.length === 1) {
    recordInfo.createdByName = userResult[0].name;
  }

  const [categoryResult] = await pool.query(searchCategoryQs, [line.category_id]);
  if (categoryResult.length === 1) {
    recordInfo.categoryName = categoryResult[0].name;
  }

  recordInfo.recordId = line.record_id;
  recordInfo.status = line.status;
  recordInfo.title = line.title;
  recordInfo.detail = line.detail;
  recordInfo.categoryId = line.category_id;
  recordInfo.applicationGroup = line.application_group;
  recordInfo.createdBy = line.created_by;
  recordInfo.createdAt = line.created_at;

  const searchItemQs = `select * from record_item_file where linked_record_id = ? order by item_id asc`;
  const [itemResult] = await pool.query(searchItemQs, [line.record_id]);
  mylog_1('itemResult');
  mylog_1(itemResult);

  const searchFileQs = `select * from file where file_id = ?`;
  for (let i = 0; i < itemResult.length; i++) {
    const item = itemResult[i];
    const [fileResult] = await pool.query(searchFileQs, [item.linked_file_id]);

    let fileName = '';
    if (fileResult.length !== 0) {
      fileName = fileResult[0].name;
    }

    recordInfo.files.push({ itemId: item.item_id, name: fileName });
  }

  await pool.query(
    `
	INSERT INTO record_last_access
	(record_id, user_id, access_time)
	VALUES
	(?, ?, now())
	ON DUPLICATE KEY UPDATE access_time = now()`,
    [`${recordId}`, `${user.user_id}`],
  );

  res.send(recordInfo);
};

// GET /record-views/tomeActive
// 自分宛一覧
const tomeActive = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  let offset = Number(req.query.offset);
  let limit = Number(req.query.limit);

  if (Number.isNaN(offset) || Number.isNaN(limit)) {
    offset = 0;
    limit = 10;
  }

  const searchMyGroupQs = `select * from group_member where user_id = ?`;
  const [myGroupResult] = await pool.query(searchMyGroupQs, [user.user_id]);
  mylog_1(myGroupResult);

  const targetCategoryAppGroupList = [];
  const searchTargetQs = `select * from category_group where group_id = ?`;

  for (let i = 0; i < myGroupResult.length; i++) {
    const groupId = myGroupResult[i].group_id;
    mylog_1(groupId);

    const [targetResult] = await pool.query(searchTargetQs, [groupId]);
    for (let j = 0; j < targetResult.length; j++) {
      const targetLine = targetResult[j];
      mylog_1(targetLine);

      targetCategoryAppGroupList.push({
        categoryId: targetLine.category_id,
        applicationGroup: targetLine.application_group,
      });
    }
  }

  let searchRecordQs =
    'select * from record where status = "open" and (category_id, application_group) in (';
  let recordCountQs =
    'select count(*) from record where status = "open" and (category_id, application_group) in (';
  const param = [];

  for (let i = 0; i < targetCategoryAppGroupList.length; i++) {
    if (i !== 0) {
      searchRecordQs += ', (?, ?)';
      recordCountQs += ', (?, ?)';
    } else {
      searchRecordQs += ' (?, ?)';
      recordCountQs += ' (?, ?)';
    }
    param.push(targetCategoryAppGroupList[i].categoryId);
    param.push(targetCategoryAppGroupList[i].applicationGroup);
  }
  searchRecordQs += ' ) order by updated_at desc, record_id  limit ? offset ?';
  recordCountQs += ' )';
  param.push(limit);
  param.push(offset);
  mylog_1(searchRecordQs);
  mylog_1(param);

  const [recordResult] = await pool.query(searchRecordQs, param);
  mylog_1(recordResult);

  const items = Array(recordResult.length);
  let count = 0;

  const searchUserQs = 'select * from user where user_id = ?';
  const searchGroupQs = 'select * from group_info where group_id = ?';
  const searchThumbQs =
    'select * from record_item_file where linked_record_id = ? order by item_id asc limit 1';
  const countQs = 'select count(*) from record_comment where linked_record_id = ?';
  const searchLastQs = 'select * from record_last_access where user_id = ? and record_id = ?';

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: null,
      createdBy: null,
      createdByName: null,
      createAt: '',
      commentCount: 0,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog_1(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let createdByName = null;
    let applicationGroupName = null;
    let thumbNailItemId = null;
    let commentCount = 0;
    let isUnConfirmed = true;

    const [userResult] = await pool.query(searchUserQs, [createdBy]);
    if (userResult.length === 1) {
      createdByName = userResult[0].name;
    }

    const [groupResult] = await pool.query(searchGroupQs, [applicationGroup]);
    if (groupResult.length === 1) {
      applicationGroupName = groupResult[0].name;
    }

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    const [countResult] = await pool.query(countQs, [recordId]);
    if (countResult.length === 1) {
      commentCount = countResult[0]['count(*)'];
    }

    const [lastResult] = await pool.query(searchLastQs, [user.user_id, recordId]);
    if (lastResult.length === 1) {
      mylog_1(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(lastResult[0].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.applicationGroupName = applicationGroupName;
    resObj.createdBy = createdBy;
    resObj.createdByName = createdByName;
    resObj.createAt = line.created_at;
    resObj.commentCount = commentCount;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const [recordCountResult] = await pool.query(recordCountQs, param);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// GET /record-views/allActive
// 全件一覧
const allActive = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  let offset = Number(req.query.offset);
  let limit = Number(req.query.limit);

  if (Number.isNaN(offset) || Number.isNaN(limit)) {
    offset = 0;
    limit = 10;
  }

  const searchRecordQs = `select * from record where status = "open" order by updated_at desc, record_id asc limit ? offset ?`;

  const [recordResult] = await pool.query(searchRecordQs, [limit, offset]);
  mylog_1(recordResult);

  const items = Array(recordResult.length);
  let count = 0;

  const searchUserQs = 'select * from user where user_id = ?';
  const searchGroupQs = 'select * from group_info where group_id = ?';
  const searchThumbQs =
    'select * from record_item_file where linked_record_id = ? order by item_id asc limit 1';
  const countQs = 'select count(*) from record_comment where linked_record_id = ?';
  const searchLastQs = 'select * from record_last_access where user_id = ? and record_id = ?';

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: null,
      createdBy: null,
      createdByName: null,
      createAt: '',
      commentCount: 0,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog_1(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let createdByName = null;
    let applicationGroupName = null;
    let thumbNailItemId = null;
    let commentCount = 0;
    let isUnConfirmed = true;

    const [userResult] = await pool.query(searchUserQs, [createdBy]);
    if (userResult.length === 1) {
      createdByName = userResult[0].name;
    }

    const [groupResult] = await pool.query(searchGroupQs, [applicationGroup]);
    if (groupResult.length === 1) {
      applicationGroupName = groupResult[0].name;
    }

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    const [countResult] = await pool.query(countQs, [recordId]);
    if (countResult.length === 1) {
      commentCount = countResult[0]['count(*)'];
    }

    const [lastResult] = await pool.query(searchLastQs, [user.user_id, recordId]);
    if (lastResult.length === 1) {
      mylog_1(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(lastResult[0].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.applicationGroupName = applicationGroupName;
    resObj.createdBy = createdBy;
    resObj.createdByName = createdByName;
    resObj.createAt = line.created_at;
    resObj.commentCount = commentCount;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'select count(*) from record where status = "open"';

  const [recordCountResult] = await pool.query(recordCountQs);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// GET /record-views/allClosed
// クローズ一覧
const allClosed = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  let offset = Number(req.query.offset);
  let limit = Number(req.query.limit);

  if (Number.isNaN(offset) || Number.isNaN(limit)) {
    offset = 0;
    limit = 10;
  }

  const searchRecordQs = `select * from record where status = "closed" order by updated_at desc, record_id asc limit ? offset ?`;

  const [recordResult] = await pool.query(searchRecordQs, [limit, offset]);
  mylog_1(recordResult);

  const items = Array(recordResult.length);
  let count = 0;

  const searchUserQs = 'select * from user where user_id = ?';
  const searchGroupQs = 'select * from group_info where group_id = ?';
  const searchThumbQs =
    'select * from record_item_file where linked_record_id = ? order by item_id asc limit 1';
  const countQs = 'select count(*) from record_comment where linked_record_id = ?';
  const searchLastQs = 'select * from record_last_access where user_id = ? and record_id = ?';

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: null,
      createdBy: null,
      createdByName: null,
      createAt: '',
      commentCount: 0,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog_1(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let createdByName = null;
    let applicationGroupName = null;
    let thumbNailItemId = null;
    let commentCount = 0;
    let isUnConfirmed = true;

    const [userResult] = await pool.query(searchUserQs, [createdBy]);
    if (userResult.length === 1) {
      createdByName = userResult[0].name;
    }

    const [groupResult] = await pool.query(searchGroupQs, [applicationGroup]);
    if (groupResult.length === 1) {
      applicationGroupName = groupResult[0].name;
    }

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    const [countResult] = await pool.query(countQs, [recordId]);
    if (countResult.length === 1) {
      commentCount = countResult[0]['count(*)'];
    }

    const [lastResult] = await pool.query(searchLastQs, [user.user_id, recordId]);
    if (lastResult.length === 1) {
      mylog_1(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(lastResult[0].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.applicationGroupName = applicationGroupName;
    resObj.createdBy = createdBy;
    resObj.createdByName = createdByName;
    resObj.createAt = line.created_at;
    resObj.commentCount = commentCount;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'select count(*) from record where status = "closed"';

  const [recordCountResult] = await pool.query(recordCountQs);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// GET /record-views/mineActive
// 自分が申請一覧
const mineActive = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  let offset = Number(req.query.offset);
  let limit = Number(req.query.limit);

  if (Number.isNaN(offset) || Number.isNaN(limit)) {
    offset = 0;
    limit = 10;
  }

  const searchRecordQs = `select * from record where created_by = ? and status = "open" order by updated_at desc, record_id asc limit ? offset ?`;

  const [recordResult] = await pool.query(searchRecordQs, [user.user_id, limit, offset]);
  mylog_1(recordResult);

  const items = Array(recordResult.length);
  let count = 0;

  const searchUserQs = 'select * from user where user_id = ?';
  const searchGroupQs = 'select * from group_info where group_id = ?';
  const searchThumbQs =
    'select * from record_item_file where linked_record_id = ? order by item_id asc limit 1';
  const countQs = 'select count(*) from record_comment where linked_record_id = ?';
  const searchLastQs = 'select * from record_last_access where user_id = ? and record_id = ?';

  for (let i = 0; i < recordResult.length; i++) {
    const resObj = {
      recordId: null,
      title: '',
      applicationGroup: null,
      applicationGroupName: null,
      createdBy: null,
      createdByName: null,
      createAt: '',
      commentCount: 0,
      isUnConfirmed: true,
      thumbNailItemId: null,
      updatedAt: '',
    };

    const line = recordResult[i];
    mylog_1(line);
    const recordId = recordResult[i].record_id;
    const createdBy = line.created_by;
    const applicationGroup = line.application_group;
    const updatedAt = line.updated_at;
    let createdByName = null;
    let applicationGroupName = null;
    let thumbNailItemId = null;
    let commentCount = 0;
    let isUnConfirmed = true;

    const [userResult] = await pool.query(searchUserQs, [createdBy]);
    if (userResult.length === 1) {
      createdByName = userResult[0].name;
    }

    const [groupResult] = await pool.query(searchGroupQs, [applicationGroup]);
    if (groupResult.length === 1) {
      applicationGroupName = groupResult[0].name;
    }

    const [itemResult] = await pool.query(searchThumbQs, [recordId]);
    if (itemResult.length === 1) {
      thumbNailItemId = itemResult[0].item_id;
    }

    const [countResult] = await pool.query(countQs, [recordId]);
    if (countResult.length === 1) {
      commentCount = countResult[0]['count(*)'];
    }

    const [lastResult] = await pool.query(searchLastQs, [user.user_id, recordId]);
    if (lastResult.length === 1) {
      mylog_1(updatedAt);
      const updatedAtNum = Date.parse(updatedAt);
      const accessTimeNum = Date.parse(lastResult[0].access_time);
      if (updatedAtNum <= accessTimeNum) {
        isUnConfirmed = false;
      }
    }

    resObj.recordId = recordId;
    resObj.title = line.title;
    resObj.applicationGroup = applicationGroup;
    resObj.applicationGroupName = applicationGroupName;
    resObj.createdBy = createdBy;
    resObj.createdByName = createdByName;
    resObj.createAt = line.created_at;
    resObj.commentCount = commentCount;
    resObj.isUnConfirmed = isUnConfirmed;
    resObj.thumbNailItemId = thumbNailItemId;
    resObj.updatedAt = updatedAt;

    items[i] = resObj;
  }

  const recordCountQs = 'select count(*) from record where created_by = ? and status = "open"';

  const [recordCountResult] = await pool.query(recordCountQs, [user.user_id]);
  if (recordCountResult.length === 1) {
    count = recordCountResult[0]['count(*)'];
  }

  res.send({ count: count, items: items });
};

// PUT records/{recordId}
// 申請更新
const updateRecord = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  const status = req.body.status;

  await pool.query(`update record set status = ? where record_id = ?`, [
    `${status}`,
    `${recordId}`,
  ]);

  res.send({});
};

// GET records/{recordId}/comments
// コメントの取得
const getComments = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;

  const commentQs = `select * from record_comment where linked_record_id = ? order by created_at desc`;

  const [commentResult] = await pool.query(commentQs, [`${recordId}`]);
  mylog_1(commentResult);

  const commentList = Array(commentResult.length);

  const searchPrimaryGroupQs = `select * from group_member where user_id = ? and is_primary = true`;
  const searchUserQs = `select * from user where user_id = ?`;
  const searchGroupQs = `select * from group_info where group_id = ?`;
  for (let i = 0; i < commentResult.length; i++) {
    let commentInfo = {
      commentId: '',
      value: '',
      createdBy: null,
      createdByName: null,
      createdByPrimaryGroupName: null,
      createdAt: null,
    };
    const line = commentResult[i];

    const [primaryResult] = await pool.query(searchPrimaryGroupQs, [line.created_by]);
    if (primaryResult.length === 1) {
      const primaryGroupId = primaryResult[0].group_id;

      const [groupResult] = await pool.query(searchGroupQs, [primaryGroupId]);
      if (groupResult.length === 1) {
        commentInfo.createdByPrimaryGroupName = groupResult[0].name;
      }
    }

    const [userResult] = await pool.query(searchUserQs, [line.created_by]);
    if (userResult.length === 1) {
      commentInfo.createdByName = userResult[0].name;
    }

    commentInfo.commentId = line.comment_id;
    commentInfo.value = line.value;
    commentInfo.createdBy = line.created_by;
    commentInfo.createdAt = line.created_at;

    commentList[i] = commentInfo;
  }

  for (const row of commentList) {
    mylog_1(row);
  }

  res.send({ items: commentList });
};

// POST records/{recordId}/comments
// コメントの投稿
const postComments = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  const value = req.body.value;

  await pool.query(
    `
    insert into record_comment
    (linked_record_id, value, created_by, created_at)
    values (?,?,?, now());`,
    [`${recordId}`, `${value}`, user.user_id],
  );

  await pool.query(
    `
    update record set updated_at = now() where record_id = ?;`,
    [`${recordId}`],
  );

  res.send({});
};

// GET categories/
// カテゴリーの取得
const getCategories = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const [rows] = await pool.query(`select * from category`);

  for (const row of rows) {
    mylog_1(row);
  }

  const items = {};

  for (let i = 0; i < rows.length; i++) {
    items[`${rows[i]['category_id']}`] = { name: rows[i].name };
  }

  res.send({ items });
};

// POST files/
// ファイルのアップロード
const postFiles = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const base64Data = req.body.data;
  mylog_1(base64Data);

  const name = req.body.name;

  const newId = uuidv4();
  const newThumbId = uuidv4();

  const binary = Buffer.from(base64Data, 'base64');

  fs.writeFileSync(`${filePath}${newId}_${name}`, binary);

  const image = await jimp.read(fs.readFileSync(`${filePath}${newId}_${name}`));
  mylog_1(image.bitmap.width);
  mylog_1(image.bitmap.height);

  const size = image.bitmap.width < image.bitmap.height ? image.bitmap.width : image.bitmap.height;
  await image.cover(size, size);

  await image.writeAsync(`${filePath}${newThumbId}_thumb_${name}`);

  await pool.query(
    `insert into file (file_id, path, name)
        values (?, ?, ?)`,
    [`${newId}`, `${filePath}${newId}_${name}`, `${name}`],
  );
  await pool.query(
    `insert into file (file_id, path, name)
        values (?, ?, ?)`,
    [`${newThumbId}`, `${filePath}${newThumbId}_thumb_${name}`, `thumb_${name}`],
  );

  res.send({ fileId: newId, thumbFileId: newThumbId });
};

// GET records/{recordId}/files/{itemId}
// 添付ファイルのダウンロード
const getRecordItemFile = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  mylog_1(recordId);
  const itemId = Number(req.params.itemId);
  mylog_1(itemId);

  const [rows] = await pool.query(
    `select f.name, f.path from record_item_file r
    inner join file f
    on
    r.linked_record_id = ?
    and
    r.item_id = ?
    and
    r.linked_file_id = f.file_id`,
    [`${recordId}`, `${itemId}`],
  );

  if (rows.length !== 1) {
    res.status(404).send({});
    return;
  }
  mylog_1(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog_1(base64);

  res.send({ data: base64, name: fileInfo.name });
};

// GET records/{recordId}/files/{itemId}/thumbnail
// 添付ファイルのサムネイルダウンロード
const getRecordItemFileThumbnail = async (req, res) => {
  let user = await getLinkedUser(req.headers);

  if (!user) {
    res.status(401).send();
    return;
  }

  const recordId = req.params.recordId;
  mylog_1(recordId);
  const itemId = Number(req.params.itemId);
  mylog_1(itemId);

  const [rows] = await pool.query(
    `select f.name, f.path from record_item_file r
    inner join file f
    on
    r.linked_record_id = ?
    and
    r.item_id = ?
    and
    r.linked_thumbnail_file_id = f.file_id`,
    [`${recordId}`, `${itemId}`],
  );

  if (rows.length !== 1) {
    res.status(404).send({});
    return;
  }
  mylog_1(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog_1(base64);

  res.send({ data: base64, name: fileInfo.name });
};

module.exports = {
  postRecords,
  getRecord,
  tomeActive,
  allActive,
  allClosed,
  mineActive,
  updateRecord,
  getComments,
  postComments,
  getCategories,
  postFiles,
  getRecordItemFile,
  getRecordItemFileThumbnail,
};
