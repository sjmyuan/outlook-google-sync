import { expect } from 'chai';
import { sequence, lazySequence } from '../src/promiseOps';

describe('promiseOps', () => {
  describe('sequence', () => {
    it('should run all the promise in sequence when ignore error', () => {
      let count = 0;
      const promise1 = new Promise((resolve, reject) => {
        count += 1;
        reject('failed');
      });

      const promise2 = new Promise((resolve, reject) => {
        count += 1;
        resolve(count);
      });

      return expect(sequence([promise1, promise2])).eventually.to.equal(2);
    });

    it('should ignore the remaining promise in sequence when does not ignore error', () => {
      let count = 0;
      const promise1 = new Promise((resolve, reject) => {
        count += 1;
        reject(count);
      });

      const promise2 = new Promise((resolve, reject) => {
        count += 1;
        resolve(count);
      });

      return expect(sequence([promise1, promise2], false)).eventually.to.be.rejected.and.be.equal(1);
    });
  });

  describe('lazySequence', () => {
    it('should run all the promise in sequence when ignore error', () => {
      let count = 0;
      const promise1 = () => new Promise((resolve, reject) => {
        count += 1;
        reject('failed');
      });

      const promise2 = () => new Promise((resolve, reject) => {
        count += 1;
        resolve(count);
      });

      return expect(lazySequence([promise1, promise2])).eventually.to.equal(2);
    });

    it('should ignore the remaining promise in sequence when does not ignore error', () => {
      let count = 0;
      const promise1 = () => new Promise((resolve, reject) => {
        count += 1;
        reject(count);
      });

      const promise2 = () => new Promise((resolve, reject) => {
        count += 1;
        resolve(count);
      });

      return expect(lazySequence([promise1, promise2], false)).eventually.to.be.rejected.and.be.equal(1);
    });
  });
});
