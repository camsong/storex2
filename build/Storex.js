'use strict';

/* global localStorage */
var storage = localStorage;

function StoreX() {}

StoreX.prototype = {
  _maxRetry: 15,

  disabled: false,

  /**
   * 类似 localStorage 的 setItem，只是支持对象，自动序列化
   */
  setItem: function setItem(key, val) {
    if (val === undefined) {
      return this.removeItem(key);
    }
    storage.setItem(key, this._serialize(val));
    return val;
  },


  /**
   * 类似 localStorage 的 getItem，只是支持对象，自动序列化
   */
  getItem: function getItem(key) {
    return this.deserialize(storage.getItem(key));
  },


  /**
   * 同 localStorage 的 removeItem
   */
  removeItem: function removeItem(key) {
    storage.removeItem(key);
  },


  /**
   * 清空缓存
   */
  clear: function clear() {
    storage.clear();
  },


  /**
   * safe set.
   * expire - 指定过期时间，接受Date实例或13位时间戳，不指定过期时间的将永不过期；
   * force - 如果设置为true，将会强制删除最先压入堆的数据，直至写入正确；默认为 true
   * _maxRetry - 最大尝试删除次数，避免无限循环；
   */
  set: function set(key, value, expire) {
    var force = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

    try {
      // 为存储数据增加过期时间expire
      if (expire instanceof Date) {
        expire = expire.getTime();
      }
      this.setItem(key, this.serialize({
        value: value,
        expire: expire || -1
      }));
      this.addQKey(key);

      return value;
    } catch (e) {
      if (force) {
        // 开始强制写入
        var max = this._maxRetry; // 最大尝试删除的次数
        while (max > 0) {
          max--;
          var qkey = this.shiftQKey();
          if (qkey) {
            this.removeItem(qkey);

            if (this.set(key, value, expire) !== null) {
              this.addQKey(key);
              return value;
            }
          } else {
            // 如果得到的 qkey 为undefined了，说明已经删除完了，没得可删了
            break;
          }
        }
      }
      return null;
    }
  },


  /**
   * safe get.
   * 数据过期删除
   */
  get: function get(key) {
    // 如果读出的数据已过期，删除该数据
    var value = this.getItem(key);
    var rtnval = !value ? null : typeof value.value !== 'undefined' ? value.value : value;

    if (value && value.expire && value.expire > 0 && value.expire < new Date().getTime()) {
      // 已过期，删除该值
      this.remove(key);
      rtnval = null;
    }

    if (rtnval != null) {
      // 找到且没有过期，则更新 key
      this.addQKey(key);
    }

    return rtnval;
  },


  /**
   * 常用函数代理
   */
  remove: function remove(key) {
    // 先从队列中剔除
    this.removeQKey(key);
    this.removeItem(key);
  },
  getAll: function getAll() {
    var ret = {};

    this.forEach(function (key, val) {
      ret[key] = val;
    });

    return ret;
  },
  forEach: function forEach(callback) {
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      callback(key, this.getItem(key));
    }
  },
  status: function status() {
    return {
      queueCount: this.getQueueCount(),
      enabled: this.enabled
    };
  },


  /**
   * 本地存储队列
   */
  _queueKey: '__queue__',

  getQueue: function getQueue() {
    // console.warn(this.get(this._queueKey));
    var queueStr = this.deserialize(storage.getItem(this._queueKey));
    var queue = queueStr && queueStr.split('|');

    if (queue !== null) {
      for (var i = 0; i < queue.length; i++) {
        queue[i] = unescape(queue[i]);
      }
    }

    return queue || [];
  },
  setQueue: function setQueue(que) {
    try {
      for (var i = 0; i < que.length; i++) {
        que[i] = escape(que[i]);
      }

      this.setItem(this._queueKey, que.join('|'));
    } catch (e) {}
  },
  addQKey: function addQKey(key) {
    var que = this.getQueue();

    if (this._getIndexOfArray(que, key) === -1) {
      // key 不存在，新增
      que.push(key);
      this.setQueue(que);
    } else {
      // key 存在，则置为尾部，即先删除再新增
      this.removeQKey(key, true);
      this.addQKey(key, true);
    }
  },
  shiftQKey: function shiftQKey() {
    var que = this.getQueue();
    var key = que.shift();
    this.setQueue(que);

    return key;
  },


  /**
   * silent - 不希望触发事件时置为true
   */
  removeQKey: function removeQKey(key) {
    var que = this.getQueue();
    var ind = this._getIndexOfArray(que, key);

    while (ind !== -1) {
      que.splice(ind, 1);
      ind = this._getIndexOfArray(que, key);
    }

    this.setQueue(que);
  },
  getQueueCount: function getQueueCount() {
    return this.getQueue().length;
  },
  _getIndexOfArray: function _getIndexOfArray(arr, value) {
    if (arr.indexOf) return arr.indexOf(value);

    var i = 0;
    var length = arr.length;
    while (i < length) {
      if (arr[i] === value) return i;
      ++i;
    }
    return -1;
  },


  /**
   * 序列化工具，将过期时间、长度校验等加入进去
   */
  _serialize: function _serialize(value) {
    return JSON.stringify(value);
  },


  /**
   * 给上面序列化的结果一层包装，增加length
   * 增加的 length 是为了校验完整性
   */
  serialize: function serialize(value) {
    var out = this._serialize(value);
    return out.length + '|' + out;
  },


  /**
   * 反序列化工具，将过期时间、长度校验检出
   */
  deserialize: function deserialize(value) {
    // 先剔除length字段, lf = length field
    if (value !== null) {
      try {
        value = JSON.parse(value);
      } catch (e) {}
      if (typeof value !== 'string') return value;

      var lf = value.match(/^(\d+?)\|/);
      if (lf !== null && lf.length === 2) {
        // matched
        var len = lf[1] * 1;
        value = value.replace(lf[0], '');
        if (len !== value.length) {
          // throw exception
          return null;
        }
        // storex格式的数据解析
        try {
          value = JSON.parse(value);
        } catch (e) {
          // throw exception
          return null;
        }
      }
    }

    return value;
  }
};

var storex = new StoreX();

try {
  var testKey = '__storexjs__';
  storex.setItem(testKey, testKey);
  if (storex.getItem(testKey) !== testKey) {
    storex.disabled = true;
  }
  storex.removeItem(testKey);
} catch (e) {
  storex.disabled = true;
}
storex.enabled = !storex.disabled;

// export as global function
/*eslint-disable */
var local = void 0;
if (typeof global !== 'undefined') {
  local = global;
} else if (typeof self !== 'undefined') {
  local = self;
} else {
  try {
    local = Function('return this')();
  } catch (e) {
    throw new Error('polyfill failed because global object is unavailable in this environment');
  }
}
local.storex = storex;
/* eslint-enable */

module.exports = storex;