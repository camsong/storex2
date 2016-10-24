/* global location */
/**
 * @file 请求缓存类
 * params 中字段解析：
 *   '__fallbackToCache', default false。设置 true 后缓存永不过期，但内部保留一个 expire 来判断是否过期
 *   dtMaxAge, dtUpdateTime, dtExpireTime 三种设置缓存时长的方式
 * @author 会影
 */
import { isFunction, isEmpty, cloneDeep, merge } from 'lodash';
import storex from './Storex';

// HACK: 当 url 中有 disableStore=true 时，禁用 localStorage
const IS_DISABLE_STORE = location.search.indexOf('disableStore=true') > -1;

/**
 * 拼接 params 到 url
 * @param {String} url 原始 url，可包含 param 和 hash
 * @param {Object} params 参数
 * @param {disableCache} disableCache 是否禁用缓存，默认为 false，如果禁用会在 params 结尾加上 _=timestamp
 */
const addUrlParams = function (url, params = {}) {
  let urlWithParams, urlPath, paramsPart, hashPart;
  urlPath = paramsPart = hashPart = '';
  if (url.indexOf('#') > 0) {
    hashPart = url.substring(url.indexOf('#'), url.length);
    urlWithParams = url.substring(0, url.indexOf('#'));
  } else {
    urlWithParams = url;
  }

  if (urlWithParams.indexOf('?') > 0) {
    urlPath = urlWithParams.substring(0, url.indexOf('?'));
    paramsPart = urlWithParams.substring(urlWithParams.indexOf('?'), urlWithParams.length);
  } else {
    urlPath = urlWithParams;
  }

  Object.keys(params).forEach((key) => {
    paramsPart += `&${key}=${params[key]}`;
  });

  if (paramsPart.length > 0) paramsPart = paramsPart.replace(/^&/, '?');

  return urlPath + paramsPart + hashPart;
};

// 约定以两个下划线结尾的自动过滤掉
const skipStoreParams = [
  'dtUpdateTime', 'dtMaxAge', 'dtExpireTime', 'callback', 'sycmToken', 'ctoken', 'token', 't', '_',
];

// 存储的 key 名
const DATA_KEY = '_d';   // 实际数据
const EXPIRE_KEY = '_e'; // 过期时间
const IDENTITY_KEY = '_id'; // 惟一性 key

function isLive(url) {
  return !!url.match(/sycm\.taobao.com\/(ipoll|custom)/g);
}

/**
 * 从 params 对象中去除 skipedKeys 和以双下划线__开头的 key，对参数进行排序
 * 返回一个新对象
 */
function stripParams(params = {}, skipedKeys = []) {
  return Object.keys(params).sort().filter(key => {
    return key.indexOf('__') === -1 && skipedKeys.indexOf(key) === -1;
  }).reduce((result, key) => {
    result[key] = params[key];
    return result;
  }, {});
}

/**
 * 生成缓存的 key
 */
function generateCacheKey(url, params = {}) {
  // 这里的 url 里也可能有参数，需要和 params 进行合并，找到直接的 pathname 和 params 部分
  if (url.indexOf('?') === -1) {
    return addUrlParams(url, stripParams(params, skipStoreParams));
  } else {
    const mergedParams = cloneDeep(params);
    const [urlPart, paramsPart] = url.split('?');

    paramsPart.split('&').forEach((paramsStr) => {
      const [k, v] = paramsStr.split('=');
      if (mergedParams[k] === undefined) {
        mergedParams[k] = v;
      }
    });
    return addUrlParams(urlPart, stripParams(mergedParams, skipStoreParams));
  }
}


/**
 * 生成缓存 key 对象
 * @param {object} identityKeyFunc 缓存 identityKey 生成函数前缀，用于区分缓存是否一致
 *
 */
function generateCacheObj(url, params = {}, identityKeyFunc) {
  const cacheObj = {
    key: '', // url + params
    useStore: true, // 是否使用缓存
    identityKey: '', // 判断缓存是否过期的 key。默认为 storeVersion + userId + updateTime
    expire: new Date().getTime(), // 缓存过期的绝对时间点
    fallbackToCache: !!params.__fallbackToCache, // 如果为 true，则缓存实际上永不过期，用于当请求出错时使用缓存
  };

  if (cacheObj.fallbackToCache
    && params.dtUpdateTime == null
    && params.dtExpireTime == null
    && params.dtMaxAge == null
  ) {
    throw new Error('你启用了 __fallbackToCache，但却没有使用 dtUpdateTime/dtExpireTime/dtMaxAge 设置过期时间！');
  }
  if (params.dtUpdateTime == null && params.dtExpireTime == null && params.dtMaxAge == null) {
    cacheObj.useStore = false;
  }

  cacheObj.key = generateCacheKey(url, params);

  // 如果只设置了 dtExpireTime，则把过期时间 dtExpireTime，优先级最高
  if (params.dtExpireTime != null) {
    cacheObj.expire = params.dtExpireTime;
  }
  // 如果只设置了 dtUpdateTime，则把过期时间 dtExpireTime 为今天结束
  if (params.dtUpdateTime != null && params.dtExpireTime == null) {
    const actualDate = new Date(); // 2013-07-30 17:11:00
    const endOfDayDate = new Date(
      actualDate.getFullYear(),
      actualDate.getMonth(),
      actualDate.getDate(),
      23, 59, 59, 999
    );

    cacheObj.expire = endOfDayDate.getTime();
  }
  // 如果只设置了 dtMaxAge，则过期时间为当前时间 + dtMaxAge
  if (params.dtMaxAge != null && params.dtExpireTime == null) {
    cacheObj.expire = params.dtMaxAge + Date.now();
  }

  cacheObj.identityKey = isFunction(identityKeyFunc) ? identityKeyFunc(url, params) : '';

  return cacheObj;
}


/**
 * 设置缓存，data 可以为数据或对象
 * @param {string} url
 * @param {object} params
 * @param {func} identityKeyFunc 生成缓存标志的函数
 * @param {object} data 要缓存的数据
 */
function setCache(url, params = {}, identityKeyFunc, data) {
  try {
    // 对实时数据，开启缓存，过期时间为 interval
    if (isLive(url) &&
      data.interval != null &&
      !isEmpty(data.data) &&
      params.dtMaxAge == null && params.dtUpdateTime == null && params.dtExpireTime == null
    ) {
      params = merge({ dtMaxAge: data.interval * 1000 }, params);
    }

    const cacheObj = generateCacheObj(url, params, identityKeyFunc);
    const { key, useStore, identityKey, expire, fallbackToCache } = cacheObj;

    // （禁用缓存且非实时）或数据为空时不缓存
    if (!useStore || isEmpty(data)) {
      return;
    }

    storex.set(
      key,
      {
        [DATA_KEY]: data,
        [EXPIRE_KEY]: expire,
        [IDENTITY_KEY]: identityKey
      },
      // 开启 fallbackToCache 后缓存一周
      fallbackToCache ? Date.now() + (7 * 24 * 60 * 60 * 1000) : cacheObj.expire,
      true,
    );
  } catch (e) {
    console.log(e);
  }
}

/**
 * 读取缓存，不存在则返回 null
 * @param {string} url
 * @param {object} params
 * @param {func} identityKeyFunc 生成缓存标志的函数
 * @param {object} options
 *   是否开启 fallbackToCache 模式，对应 __fallbackToCache 用于请求失败读取缓存的场景。
 *   useStore 是否强制去读缓存，但还是会判断过期时间
 */
function getCache(url, params, identityKeyFunc, options = { fallbackToCache: false }) {
  if (IS_DISABLE_STORE === 1) {
    return null;
  }

  try {
    const cacheObj = generateCacheObj(url, params, identityKeyFunc);
    // 对实时数据强制尝试读取请求
    if (!cacheObj.useStore && !isLive(url)) {
      return null;
    }

    // 这里如果缓存过期，storex 会自动删除它
    const storeData = (storex.get(cacheObj.key) || {});

    if (storeData && storeData[DATA_KEY]) {
      if (cacheObj.identityKey !== storeData[IDENTITY_KEY]) { // identityKey 变化，删除缓存
        storex.remove(cacheObj.key);
        return null;
      }
      if (options.fallbackToCache) { // 强制读取时不检查是否过期，直接返回，对应于 __fallbackToCache
        return storeData[DATA_KEY];
      }
      if (storeData[EXPIRE_KEY] >= new Date().getTime()) { // 检查是否过期
        return storeData[DATA_KEY];
      }
    }

    return null;
  } catch (e) {
    console.error(e);
  }
  return null;
}

/**
 * 删除缓存
 */
function removeCache(url, params) {
  const cacheObj = generateCacheObj(url, params);
  storex.remove(cacheObj.key);
}

function setItem() {
  throw new Error('RequestCache.setItem is deprecated, use RequestCache.setCache instead.');
}

function getItem() {
  throw new Error('RequestCache.getItem is deprecated, use RequestCache.getCache instead.');
}

module.exports = {
  setCache, getCache, removeCache, stripParams,
  generateCacheKey, generateCacheObj, setItem, getItem,
};
