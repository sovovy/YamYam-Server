const storeDao = require('../dao/storeDao');
const goodsDao = require('../dao/goodsDao');
const elasticsearchStore = require('../elasticsearch/store');
const storeTransaction = require('../dao/storeTransaction');
const { s3Location } = require('../../config/s3Config');

// 단일 키 객체 => 값 배열
function parseObj(dataArr, attr) {
  const res = [];

  for (let i = 0; i < dataArr.length; i++) {
    res.push(dataArr[i][attr]);
  }

  return res;
}

async function getStoreRank(userIdx, lastIndex, storeCategoryIdx) {
  // idx, name, img, url, rating, review_cnt
  const store = await storeDao.selectStoreRank(lastIndex, storeCategoryIdx);

  const storeLength = store.length;
  let scrapStoreIdx;
  if (userIdx != 0) {
    scrapStoreIdx = await storeDao.getUserScrapStoreIdx(userIdx, lastIndex);
    scrapStoreIdx = parseObj(scrapStoreIdx, 'store_idx');
  }

  for (let i = 0; i < storeLength; i++) {
    // img s3Location concat
    store[i].store_img = s3Location + store[i].store_img;

    // hashtags
    store[i].store_hashtags = await storeDao.selectStoreHashtag(store[i].store_idx) || [];
    store[i].store_hashtags = parseObj(store[i].store_hashtags, 'store_hashtag_name');
    // scrap_flag
    if (userIdx != 0) {
      store[i].store_scrap_flag = scrapStoreIdx.includes(store[i].store_idx);
    }
  }
  return store;
}

async function getStoreScrap(userIdx, lastIndex, storeCategoryIdx) {
  // idx, name, img, url, rating, review_cnt
  const store = await storeDao.selectStoreScrap(userIdx, lastIndex, storeCategoryIdx);

  const storeLength = store.length;
  for (let i = 0; i < storeLength; i++) {
    // img s3Location concat
    store[i].store_img = s3Location + store[i].store_img;

    // hashtags
    store[i].store_hashtags = await storeDao.selectStoreHashtag(store[i].store_idx) || [];
    store[i].store_hashtags = parseObj(store[i].store_hashtags, 'store_hashtag_name');
  }
  return store;
}

async function addStoreScrap(storeIdx, userIdx) {
  const chkScrap = await storeDao.selectUserScrapWithStoreIdx(storeIdx, userIdx);
  if (chkScrap.length == 0) {
    await storeDao.insertStoreScrap(storeIdx, userIdx);
  }
}

async function removeStoreScrap(storeIdx, userIdx) {
  await storeDao.deleteStoreScrap(storeIdx, userIdx);
}

async function getStoreGoodsCategory(storeIdx) {
  // [{'goods_category_idx':1, 'goods_category_name':'asd'}, ...]
  const category = await goodsDao.selectStoreGoodsCategory(storeIdx);

  return category;
}

async function getStoreCategory() {
  // [{'store_category_idx':1, 'store_category_name':'asd'}, ...]
  const category = await storeDao.selectStoreCategory();

  return category;
}

async function getStoreGoods(userIdx, storeIdx, order, lastIndex, goodsCategoryIdx, firstFlag) {
  // [{'goods_idx': 1, 'goods_img': 'http://~~', 'store_name':'asd', 'goods_name':'asd', 'goods_price': 32900, 'goods_rating':3.2, 'goods_minimum_amount':10, 'goods_review_cnt': 300 [goods_like_flag: true]}, ...]
  const goods = await goodsDao.selectStoreGoods(storeIdx, order, lastIndex, goodsCategoryIdx);

  let scrapGoods;
  if (userIdx) scrapGoods = await goodsDao.selectGoodsScrapWithUserIdx(userIdx);

  if (parseInt(firstFlag, 10)) {
    await storeDao.updateStoreHit(storeIdx);
  }

  const goodsLength = goods.length;

  for (let i = 0; i < goodsLength; i++) {
    // add first img url (thumnail)
    goods[i].goods_img = await goodsDao.selectFirstGoodsImg(goods[i].goods_idx) || '';
    goods[i].goods_img = s3Location + parseObj(goods[i].goods_img, 'goods_img')[0];

    // add store name
    goods[i].store_name = await storeDao.selectStoreName(goods[i].store_idx) || '';
    goods[i].store_name = goods[i].store_name[0].store_name;
    delete goods[i].store_idx;

    // add like flag
    if (userIdx) {
      if (scrapGoods.includes(goods[i].goods_idx)) goods[i].scrap_flag = 1;
      else goods[i].scrap_flag = 0;
    }
  }

  return goods;
}

async function addStore(file, name, url, hashTag, categoryName) {
  const img = file.location.split(s3Location)[1];

  await storeTransaction.insertStoreTransaction(img, name, url, hashTag, categoryName);
}

async function getStoreBySearch(userIdx, searchAfter, goodsName, order) {
  const storeFromES = await elasticsearchStore.getStoreByStoreName(searchAfter, goodsName, order);

  const storeLength = storeFromES.store.length;
  for (let i = 0; i < storeLength; i++) {
    // img
    storeFromES.store[i].store_img = s3Location + storeFromES.store[i].store_img;

    const storeIdx = storeFromES.store[i].store_idx;
    // scrap_flag
    const user = await storeDao.selectUserScrapWithStoreIdx(storeIdx, userIdx);

    if (user.length === 0) {
      storeFromES.store[i].store_scrap_flag = 0;
    } else {
      storeFromES.store[i].store_scrap_flag = 1;
    }
  }

  return storeFromES;
}

async function getWebInfo() {
  const result = {};
  const store = await storeDao.selectStore();
  const category = await goodsDao.selectGoodsCategoryWeb();

  result.store = store;

  result.goods_category = category;

  for (let i = 0; i < result.goods_category.length; i++) {
    result.goods_category[i].goods_category_option = await goodsDao.selectGoodsCategoryOptionWeb(category[i].goods_category_idx);
  }

  return result;
}

module.exports = {
  getStoreRank,
  getStoreScrap,
  addStoreScrap,
  removeStoreScrap,
  getStoreGoodsCategory,
  getStoreCategory,
  getStoreGoods,
  addStore,
  getStoreBySearch,
  getWebInfo,
};
