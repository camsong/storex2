'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }(); /* global location */
/**
 * @file 请求缓存类
 * params 中字段解析：
 *   '__fallbackToCache', default false。设置 true 后缓存永不过期，但内部保留一个 expire 来判断是否过期
 *   dtMaxAge, dtUpdateTime, dtExpireTime 三种设置缓存时长的方式
 * @author 会影
 */


var _lodash = require('lodash');

var _Storex = require('./Storex');

var _Storex2 = _interopRequireDefault(_Storex);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// HACK: 当 url 中有 disableStore=true 时，禁用 localStorage
var IS_DISABLE_STORE = location.search.indexOf('disableStore=true') > -1;

/**
 * 拼接 params 到 url
 * @param {String} url 原始 url，可包含 param 和 hash
 * @param {Object} params 参数
 * @param {disableCache} disableCache 是否禁用缓存，默认为 false，如果禁用会在 params 结尾加上 _=timestamp
 */
var addUrlParams = function addUrlParams(url) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  var urlWithParams = void 0,
      urlPath = void 0,
      paramsPart = void 0,
      hashPart = void 0;
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

  Object.keys(params).forEach(function (key) {
    paramsPart += '&' + key + '=' + params[key];
  });

  if (paramsPart.length > 0) paramsPart = paramsPart.replace(/^&/, '?');

  return urlPath + paramsPart + hashPart;
};

// 约定以两个下划线结尾的自动过滤掉
var skipStoreParams = ['dtUpdateTime', 'dtMaxAge', 'dtExpireTime', 'callback', 'sycmToken', 'ctoken', 'token', 't', '_'];

// 存储的 key 名
var DATA_KEY = '_d'; // 实际数据
var EXPIRE_KEY = '_e'; // 过期时间
var IDENTITY_KEY = '_id'; // 惟一性 key

function isLive(url) {
  return !!url.match(/sycm\.taobao.com\/(ipoll|custom)/g);
}

/**
 * 从 params 对象中去除 skipedKeys 和以双下划线__开头的 key，对参数进行排序
 * 返回一个新对象
 */
function stripParams() {
  var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var skipedKeys = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

  return Object.keys(params).sort().filter(function (key) {
    return key.indexOf('__') === -1 && skipedKeys.indexOf(key) === -1;
  }).reduce(function (result, key) {
    result[key] = params[key];
    return result;
  }, {});
}

/**
 * 生成缓存的 key
 */
function generateCacheKey(url) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  // 这里的 url 里也可能有参数，需要和 params 进行合并，找到直接的 pathname 和 params 部分
  if (url.indexOf('?') === -1) {
    return addUrlParams(url, stripParams(params, skipStoreParams));
  } else {
    var _ret = function () {
      var mergedParams = (0, _lodash.cloneDeep)(params);

      var _url$split = url.split('?');

      var _url$split2 = _slicedToArray(_url$split, 2);

      var urlPart = _url$split2[0];
      var paramsPart = _url$split2[1];


      paramsPart.split('&').forEach(function (paramsStr) {
        var _paramsStr$split = paramsStr.split('=');

        var _paramsStr$split2 = _slicedToArray(_paramsStr$split, 2);

        var k = _paramsStr$split2[0];
        var v = _paramsStr$split2[1];

        if (mergedParams[k] === undefined) {
          mergedParams[k] = v;
        }
      });
      return {
        v: addUrlParams(urlPart, stripParams(mergedParams, skipStoreParams))
      };
    }();

    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
  }
}

/**
 * 生成缓存 key 对象
 * @param {object} identityKeyFunc 缓存 identityKey 生成函数前缀，用于区分缓存是否一致
 *
 */
function generateCacheObj(url) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var identityKeyFunc = arguments[2];

  var cacheObj = {
    key: '', // url + params
    useStore: true, // 是否使用缓存
    identityKey: '', // 判断缓存是否过期的 key。默认为 storeVersion + userId + updateTime
    expire: Date.now(), // 缓存过期的绝对时间点，默认为马上过期
    fallbackToCache: !!params.__fallbackToCache };

  if (cacheObj.fallbackToCache && params.dtUpdateTime == null && params.dtExpireTime == null && params.dtMaxAge == null) {
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
    var actualDate = new Date(); // 2013-07-30 17:11:00
    var endOfDayDate = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate(), 23, 59, 59, 999);

    cacheObj.expire = endOfDayDate.getTime();
  }
  // 如果只设置了 dtMaxAge，则过期时间为当前时间 + dtMaxAge
  if (params.dtMaxAge != null && params.dtExpireTime == null) {
    cacheObj.expire = params.dtMaxAge + Date.now();
  }

  cacheObj.identityKey = (0, _lodash.isFunction)(identityKeyFunc) ? identityKeyFunc(url, params) : '';

  return cacheObj;
}

/**
 * 设置缓存，data 可以为数据或对象
 * @param {string} url
 * @param {object} params
 * @param {func} identityKeyFunc 生成缓存标志的函数
 * @param {object} data 要缓存的数据
 */
function setCache(url) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var identityKeyFunc = arguments[2];
  var data = arguments[3];

  try {
    var _storex$set;

    // 对实时数据，开启缓存，过期时间为 interval
    if (isLive(url) && data.interval != null && !(0, _lodash.isEmpty)(data.data) && params.dtMaxAge == null && params.dtUpdateTime == null && params.dtExpireTime == null) {
      params = (0, _lodash.merge)({ dtMaxAge: data.interval * 1000 }, params);
    }

    var cacheObj = generateCacheObj(url, params, identityKeyFunc);
    var key = cacheObj.key;
    var useStore = cacheObj.useStore;
    var identityKey = cacheObj.identityKey;
    var expire = cacheObj.expire;
    var fallbackToCache = cacheObj.fallbackToCache;

    // （禁用缓存且非实时）或数据为空时不缓存

    if (!useStore || (0, _lodash.isEmpty)(data)) {
      return;
    }

    _Storex2.default.set(key, (_storex$set = {}, _defineProperty(_storex$set, DATA_KEY, data), _defineProperty(_storex$set, EXPIRE_KEY, expire), _defineProperty(_storex$set, IDENTITY_KEY, identityKey), _storex$set),
    // 开启 fallbackToCache 后缓存一周
    fallbackToCache ? Date.now() + 7 * 24 * 60 * 60 * 1000 : cacheObj.expire, true);
  } catch (e) {}
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
function getCache(url, params, identityKeyFunc) {
  var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : { fallbackToCache: false };

  if (IS_DISABLE_STORE === 1) {
    return null;
  }

  try {
    var cacheObj = generateCacheObj(url, params, identityKeyFunc);
    // 对实时数据强制尝试读取请求
    if (!cacheObj.useStore && !isLive(url)) {
      return null;
    }

    // 这里如果缓存过期，storex 会自动删除它
    var storeData = _Storex2.default.get(cacheObj.key) || {};

    if (storeData && storeData[DATA_KEY]) {
      if (cacheObj.identityKey !== storeData[IDENTITY_KEY]) {
        // identityKey 变化，删除缓存
        _Storex2.default.remove(cacheObj.key);
        return null;
      }
      if (options.fallbackToCache) {
        // 强制读取时不检查是否过期，直接返回，对应于 __fallbackToCache
        return storeData[DATA_KEY];
      }
      if (storeData[EXPIRE_KEY] >= new Date().getTime()) {
        // 检查是否过期
        return storeData[DATA_KEY];
      }
    }

    return null;
  } catch (e) {}
  return null;
}

/**
 * 删除缓存
 */
function removeCache(url, params) {
  var cacheObj = generateCacheObj(url, params);
  _Storex2.default.remove(cacheObj.key);
}

function setItem() {
  throw new Error('RequestCache.setItem is deprecated, use RequestCache.setCache instead.');
}

function getItem() {
  throw new Error('RequestCache.getItem is deprecated, use RequestCache.getCache instead.');
}

module.exports = {
  setCache: setCache, getCache: getCache, removeCache: removeCache, stripParams: stripParams,
  generateCacheKey: generateCacheKey, generateCacheObj: generateCacheObj, setItem: setItem, getItem: getItem
};