'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RequestCache = undefined;

var _Storex = require('./Storex');

var _Storex2 = _interopRequireDefault(_Storex);

var _RequestCache = require('./RequestCache');

var _RequestCache2 = _interopRequireDefault(_RequestCache);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// 默认导出 Storex，同时也导出 RequestCache
exports.RequestCache = _RequestCache2.default;
exports.default = _Storex2.default;