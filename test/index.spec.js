/* global describe, before, after, beforeEach, afterEach, it, localStorage */
import chai, { expect } from 'chai';
import { getInfo } from 'localStorage-info';
import storex from '../src';

chai.config.showDiff = true;

describe('functions do not use queue: setItem, getItem, removeItem, clear', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should not disabled', () => {
    expect(storex.disabled).to.equal(false);
  });

  it('setItem works', () => {
    storex.setItem('foo', { bar: 'zar' });
    expect(storex.getItem('foo')).to.deep.equal({ bar: 'zar' });
    // setItem will not update _queueKey
    expect(storex.getItem(storex._queueKey)).to.equal(null);
  });

  it('setItem remove item when no value', () => {
    storex.setItem('foo', { bar: 'zar' });
    storex.setItem('foo');
    expect(localStorage.getItem('foo')).to.equal(null);
  });

  it('removeItem works', () => {
    localStorage.setItem('foo', 'bar');
    storex.removeItem('foo');
    expect(localStorage.getItem('foo')).to.equal(null);
  });

  it('clear works', () => {
    localStorage.setItem('foo', 'bar');
    expect(localStorage.length).to.equal(1);
    storex.clear();
    expect(localStorage.length).to.equal(0);
  });

  it('should support chinese', () => {
    const chinese = '内容是中文http://test.com?params=这里也有中文';
    storex.setItem('foo', { bar: chinese });
    expect(storex.getItem('foo')).to.deep.equal({ bar: chinese });
  });
});


describe('functions use queue: set, get, remove', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('can get after set', () => {
    storex.set('key', 'hello');
    expect(storex.get('key')).to.equal('hello');
    storex.set('key', { a: '中文abc', b: [1, 2, 3] });
    expect(storex.get('key')).to.deep.equal({ a: '中文abc', b: [1, 2, 3] });
    // should update _queueKey
    expect(storex.getItem(storex._queueKey)).to.equal('key');
    storex.remove('key');
    expect(storex.get('key')).to.equal(null);
    expect(storex.getItem(storex._queueKey)).to.equal('');
  });

  it('set support expire', () => {
    const expireTime = Date.now() + 5000;
    storex.set('key', 'hello', expireTime);
    expect(storex.getItem('key')).to.deep.equal({ value: 'hello', expire: expireTime });
    expect(storex.get('key')).to.equal('hello');
  });

  it('will remove the key if expired', () => {
    const expireTime = Date.now() - 5000;
    storex.set('key', 'hello', expireTime);
    expect(storex.getItem('key')).to.deep.equal({ value: 'hello', expire: expireTime });
    // get() will remove the cache, but getItem will not
    expect(storex.get('key')).to.equal(null);
    expect(storex.getItem('key')).to.equal(null);
  });
});

describe('getAll, forEach, status', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getAll return all items', () => {
    const expireTime = Date.now() + 5000;
    storex.set('foo', 'foo', expireTime);
    storex.set('bar', { a: '中文abc', b: [1, 2, 3] });
    storex.set('zar', 123);

    expect(storex.getAll()).to.deep.equal({
      foo: { value: 'foo', expire: expireTime },
      bar: { value: { a: '中文abc', b: [1, 2, 3] }, expire: -1 },
      zar: { value: 123, expire: -1 },
      [storex._queueKey]: 'foo|bar|zar',
    });
  });
});

describe('getQueue, setQueue, addQKey, shiftQKey, removeQKey, getQueueCount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getQueue return queue', () => {
    localStorage.setItem(storex._queueKey, 'a|http%3A//abc.com%3Fkey%3Dabc|中文');
    expect(storex.getQueue()).to.deep.equal(['a', 'http://abc.com?key=abc', '中文']);
  });

  it('setQueue can set queue', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    expect(
      localStorage.getItem(storex._queueKey)
    ).to.deep.equal('"a|http%3A//abc.com%3Fkey%3Dabc|%u4E2D%u6587"');
  });

  it('addQKey can add key if not exists', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    storex.addQKey('newKey');
    expect(
      localStorage.getItem(storex._queueKey)
    ).to.deep.equal('"a|http%3A//abc.com%3Fkey%3Dabc|%u4E2D%u6587|newKey"');
  });

  it('addQKey will change key to last if key exists', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    storex.addQKey('http://abc.com?key=abc');
    expect(
      localStorage.getItem(storex._queueKey)
    ).to.deep.equal('"a|%u4E2D%u6587|http%3A//abc.com%3Fkey%3Dabc"');
  });

  it('shiftQKey will remove first one', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    storex.shiftQKey();
    expect(storex.getQueue()).to.deep.equal(['http://abc.com?key=abc', '中文']);
    storex.shiftQKey();
    expect(storex.getQueue()).to.deep.equal(['中文']);
    storex.shiftQKey();
    expect(storex.getQueue()).to.deep.equal([]);
  });

  it('removeQKey will remove the matched key', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    storex.removeQKey('a');
    expect(storex.getQueue()).to.deep.equal(['http://abc.com?key=abc', '中文']);
    storex.removeQKey('not_existed');
    expect(storex.getQueue()).to.deep.equal(['http://abc.com?key=abc', '中文']);
  });

  it('getQueueCount', () => {
    const arr = ['a', 'http://abc.com?key=abc', '中文'];
    storex.setQueue(arr);
    expect(storex.getQueueCount()).to.equal(3);
  });
});

describe('serialize, deserialize', () => {
  before(() => {
    localStorage.clear();
  });

  after(() => {
    localStorage.clear();
  });

  it('serialize works', () => {
    expect(storex.serialize('hello')).to.equal('7|"hello"');
    expect(storex.serialize('中文abc')).to.equal('7|"中文abc"');
    expect(storex.serialize(['123', '中文abc'])).to.equal('15|["123","中文abc"]');
    expect(storex.serialize(
      { foo: '中文abc', bar: '123' }
    )).to.equal('27|{"foo":"中文abc","bar":"123"}');
  });

  it('deserialize works', () => {
    // string
    expect(storex.deserialize('7|"hello"')).to.equal('hello');
    // chinese
    expect(storex.deserialize('7|"中文abc"')).to.equal('中文abc');
    // array
    expect(storex.deserialize('15|["123","中文abc"]')).to.deep.equal(['123', '中文abc']);
    // object
    expect(storex.deserialize(
      '27|{"foo":"中文abc","bar":"123"}'
    )).to.deep.equal({ foo: '中文abc', bar: '123' });
  });

  it('deserialize return null if length is wrong', () => {
    expect(storex.deserialize('2|"hello"')).to.equal(null);
  });

  it('deserialize return null if parse error', () => {
    expect(storex.deserialize('27|{"foo":"中文abc","bar":"123"]')).to.equal(null);
  });
});

describe('LRU cache', () => {
  before(() => {
    localStorage.clear();
  });

  after(() => {
    localStorage.clear();
  });

  it('set or get will change the key order', () => {
    storex.set('foo', '123');
    storex.set('bor', '123');
    storex.set('car', '123');
    storex.set('dor', '123');
    expect(storex.getItem(storex._queueKey)).to.equal('foo|bor|car|dor');
    storex.set('bor', '123');
    expect(storex.getItem(storex._queueKey)).to.equal('foo|car|dor|bor');
    storex.get('foo');
    expect(storex.getItem(storex._queueKey)).to.equal('car|dor|bor|foo');
  });

  it('if exceed storage size, will remove the least recent used values', () => {
    storex.set('foo', '123');
    storex.set('bor', '123');
    storex.set('car', '123');
    storex.set('dor', '123');
    const storageSize = getInfo().size;
    storex.set('exceedOne', Array(storageSize).join('x'));
    // trying to add a very big one will remove all existed values
    expect(storex.getItem(storex._queueKey)).to.equal('');
  });

  it('set without force will not remove existed values', () => {
    storex.set('foo', '123');
    storex.set('bor', '123');
    storex.set('car', '123');
    storex.set('dor', '123');
    const storageSize = getInfo().size;
    storex.set('exceedOne', Array(storageSize).join('x'), -1, false);
    // trying to add a very big one will remove all existed values
    expect(storex.getItem(storex._queueKey)).to.equal('foo|bor|car|dor');
  });

  it('if exceed storage size, will remove the least recent used one', () => {
    storex.set('a', Array(1024).join('x'));
    storex.set('b', Array(1024).join('x'));
    storex.set('c', Array(1024).join('x'));
    storex.set('d', Array(1024).join('x'));
    storex.get('a'); // a is recently visited, so will not be removed
    const storageSize = getInfo().size;
    storex.set('bigOne', Array(storageSize - (1024 * 4) - 10).join('x'));
    expect(storex.getItem(storex._queueKey)).to.equal('c|d|a|bigOne');
  });
});
