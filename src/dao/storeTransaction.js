const mysql = require('../library/mysql');
const elasticsearchStore = require('../elasticsearch/store');

async function insertStore(connection, img, name, url) {
  const sql = `
    INSERT INTO STORE
    (store_name, store_img, store_url)
    VALUES
    (?, ?, ?)
    `;

  const result = await connection.query(sql, [name, img, url]);

  return result;
}

async function insertHashTag(connection, storeIdx, hashTag) {
  const sql = `
    INSERT INTO STORE_HASHTAG
    (store_idx, store_hashtag_name)
    VALUES
    (?, ?)
    `;

  await connection.query(sql, [storeIdx, hashTag]);
}

async function selectCategory(connection, categoryName) {
  const sql = `
    SELECT 
    store_category_idx
    FROM STORE_CATEGORY
    WHERE store_category_name = ?
    `;

  const result = await connection.query(sql, categoryName);

  return result;
}

async function insertCategory(connection, categoryName) {
  const sql = `
  INSERT INTO STORE_CATEGORY
  (store_category_name)
  VALUES
  (?)
  `;

  const result = await connection.query(sql, [categoryName]);

  return result;
}

async function insertCategoryStore(connection, storeIdx, categoryIdx) {
  const sql = `
    INSERT INTO STORE_CATEGORY_STORE
    (store_idx, store_category_idx)
    VALUES
    (?, ?)
    `;

  await connection.query(sql, [storeIdx, categoryIdx]);
}

async function insertStoreTransaction(img, name, url, hashTag, categoryName) {
  await mysql.transaction(async (connection) => {
    const store = await insertStore(connection, img, name, url);
    const storeIdx = store.insertId;

    // HashTag 등록
    const hashTagLength = hashTag.length;
    for (let i = 0; i < hashTagLength; i++) {
      await insertHashTag(connection, storeIdx, hashTag[i]);
    }

    // category 등록
    const categoryNameLength = categoryName.length;
    for (let i = 0; i < categoryNameLength; i++) {
      const category = await selectCategory(connection, categoryName[i]);

      let categoryIdx;
      if (category.length != 0) { // 카테고리가 있는 경우
        categoryIdx = category[0].store_category_idx;
      } else {
        const newCategory = await insertCategory(connection, categoryName[i]);
        categoryIdx = newCategory.insertId;
      }

      await insertCategoryStore(connection, storeIdx, categoryIdx);
    }


    // elasticsearch store 추가
    await elasticsearchStore.addStore(storeIdx, name, img, hashTag, url);
  });
}

async function updateAllStoreRank(connection) {
  const sql = `
  UPDATE STORE SET store_rank_score = store_scrap_cnt + store_hit;
  `;

  await connection.query(sql);
}

async function updateAllStoreHit(connection, value) {
  const sql = `
  UPDATE STORE SET store_hit = ?
  `;

  await connection.query(sql, [value]);
}

async function updateAllStoreScrapCnt(connection, value) {
  const sql = `
  UPDATE STORE SET store_scrap_cnt = ?
  `;

  await connection.query(sql, [value]);
}

async function selectStore(connection) {
  const sql = `
  SELECT store_idx, store_rank_score FROM STORE
  `;

  const result = await connection.query(sql);

  return result;
}

async function calculateStoreRankTransaction() {
  await mysql.transaction(async (connection) => {
    await updateAllStoreRank(connection);
    await updateAllStoreHit(connection, 0);
    await updateAllStoreScrapCnt(connection, 0);

    const storeArr = await selectStore(connection);
    const storeArrLength = storeArr.length;

    for (let i = 0; i < storeArrLength; i++) {
      const storeIdx = storeArr[i].store_idx;
      const storeRankScore = storeArr[i].store_rank_score;

      await elasticsearchStore.updateStoreRankScore(storeIdx, storeRankScore);
    }
  });
}

module.exports = {
  insertStoreTransaction,
  calculateStoreRankTransaction,
};
