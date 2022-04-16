const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

const mylog = (obj) => {
  if (Array.isArray(obj)) {
    for (const e of obj) {
      console.log(e);
    }
    return;
  }
  console.log(obj);
};

const getLinkedUser = async (headers) => {
  const target = headers['x-app-key'];
  mylog(target);
  const qs = `select * from session where value = ?`;

  const [rows] = await pool.query(qs, [`${target}`]);

  if (rows.length !== 1) {
    mylog('セッションが見つかりませんでした。');
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

  mylog(user);

  const body = req.body;
  mylog(body);

  let [rows] = await pool.query(
    `select * from group_member where user_id = ?
    AND is_primary = true`,
    [user.user_id],
  );

  if (rows.length !== 1) {
    mylog('申請者のプライマリ組織の解決に失敗しました。');
    res.status(400).send();
    return;
  }

  const userPrimary = rows[0];

  mylog(userPrimary);

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
  mylog(recordResult);

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
  mylog('itemResult');
  mylog(itemResult);

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

  const searchTargetCategoryGroupQs = `
  select
    cg.category_id,
    cg.application_group
  from
    group_member as gm
  inner join
    category_group as cg
  on
    gm.group_id = cg.group_id
  where gm.user_id = ?
  `;

  const searchRecordQs =`
  select
	  r.record_id,
	  r.title,
	  r.application_group,
	  gi.name as application_group_name,
	  r.created_by,
	  u.name as created_by_name,
	  r.created_at,
	  rc.comment_count,
	  rla.access_time,
	  rif.item_id as thumb_nail_item_id,
	  r.updated_at
  from
	  (select 
		  record_id,
		  title,
		  application_group,
		  created_by,
		  created_at,
		  updated_at
	  from
		  record
	  where
		  status = "open"
	  and
		  (category_id, application_group) in (${searchTargetCategoryGroupQs})
	  limit ? offset ?) as r
  left join
	  group_info as gi
  on
	  r.application_group = gi.group_id
  left join
	  user as u
  on
	  r.created_by = u.user_id
  left join
	  (select
		  linked_record_id,
		  count(linked_record_id) as comment_count
	  from
		  record_comment
	  group by
		  linked_record_id) as rc
  on
	  r.record_id = rc.linked_record_id
  left join
	  (select
		  record_id,
		  access_time
	  from
		  record_last_access
	  where user_id = ?) as rla
  on
	  r.record_id = rla.record_id
  left join
	  (select
		  linked_record_id,
		  substring_index(group_concat(item_id order by item_id asc separator ','), ',', 1) as item_id
	  from
		  record_item_file
	  group by
		linked_record_id) as rif
  on
	  r.record_id = rif.linked_record_id
  order by
	  r.updated_at desc,
	  r.record_id`;
  
  mylog(searchRecordQs);
  const [recordResults] = await pool.query(searchRecordQs, [user.user_id, limit, offset, user.user_id]);
  mylog([user.user_id, user.user_id, limit, offset]);
  mylog(recordResults);
  const items = recordResults.map(result => {
    let isUnConfirmed = true;
    const updatedAtNum = Date.parse(result.updated_at);
    const accessTimeNum = Date.parse(result.access_time);
    if (!!(accessTimeNum) && updatedAtNum <= accessTimeNum)
      isUnConfirmed = false;
    
    return {
      recordId: result.record_id || '',
      title: result.title || '',
      applicationGroup: result.application_group || '',
      applicationGroupName: result.application_group_name || null,
      createdBy: result.created_by || null,
      createdByName: result.created_by_name || null,
      createAt: result.created_at,
      commentCount: result.comment_count || 0,
      isUnConfirmed: isUnConfirmed,
      thumbNailItemId: Number(result.thumb_nail_item_id),
      updatedAt: result.updated_at,
    };
  });
  mylog(items);
  const recordCountQs = `select count(*) from record where status = "open" and (category_id, application_group) in (${searchTargetCategoryGroupQs})`;
  const [recordCountResult] = await pool.query(recordCountQs, [user.user_id]);
  if (recordCountResult.length === 1)
    count = recordCountResult[0]['count(*)'];
  res.send({ count, items });
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
  mylog(recordResult);

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
    mylog(line);
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
      mylog(updatedAt);
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
  mylog(recordResult);

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
    mylog(line);
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
      mylog(updatedAt);
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
  mylog(recordResult);

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
    mylog(line);
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
      mylog(updatedAt);
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
  mylog(commentResult);

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
    mylog(row);
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
    mylog(row);
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
  mylog(base64Data);

  const name = req.body.name;

  const newId = uuidv4();
  const newThumbId = uuidv4();

  const binary = Buffer.from(base64Data, 'base64');

  fs.writeFileSync(`${filePath}${newId}_${name}`, binary);

  const image = await jimp.read(fs.readFileSync(`${filePath}${newId}_${name}`));
  mylog(image.bitmap.width);
  mylog(image.bitmap.height);

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
  mylog(recordId);
  const itemId = Number(req.params.itemId);
  mylog(itemId);

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
  mylog(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog(base64);

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
  mylog(recordId);
  const itemId = Number(req.params.itemId);
  mylog(itemId);

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
  mylog(rows[0]);

  const fileInfo = rows[0];

  const data = fs.readFileSync(fileInfo.path);
  const base64 = data.toString('base64');
  mylog(base64);

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
