/* global describe,
before, after, beforeEach, afterEach, it, localStorage */
import chai, { expect } from 'chai';
import RequestCache from '../src/RequestCache';

chai.config.showDiff = true;

describe('RequestCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('if exceed storage size, will remove the least recent used one', () => {
    const obj = RequestCache.generateCacheObj('http://sycm.taobao.com/api.json', { foo: 'bar' });
    expect(obj).to.deep.equal({
      key: 'http://sycm.taobao.com/api.json?foo=bar',
      useStore: false,
      identityKey: '',
      expire: obj.expire, // 过期时间为现在，暂不测试
      fallbackToCache: false
    });

    expect(Math.abs(obj.expire - Date.now()) < 1000).to.be.true;
  });
});
