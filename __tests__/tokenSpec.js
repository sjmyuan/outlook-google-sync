import { expect } from 'chai';
import sinon from 'sinon';
import * as token from '../src/token';

describe('token', () => {
  let clock = null;
  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });
  describe('sign', () => {
    it('should return the signed token', () => {
      return expect(token.sign('test', 'test')).eventually.to.equal('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjM2MDAsImRhdGEiOiJ0ZXN0IiwiaWF0IjowfQ.ACw2LSfCN_tlTT0TQPGrsRCJ1OFutoP_x9i0tWQ2KTU');
    });
  });

  describe('verify', () => {
    it('should return true for signed token', () => {
      return expect(token.verify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjM2MDAsImRhdGEiOiJ0ZXN0IiwiaWF0IjowfQ.ACw2LSfCN_tlTT0TQPGrsRCJ1OFutoP_x9i0tWQ2KTU', 'test')).eventually.to.equal(true);
    });
  });
});
