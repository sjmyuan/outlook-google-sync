import { expect } from 'chai';
import sinon from 'sinon';
import nock from 'nock';
import { getAuthUrl, getTokenFromCode, refreshAccessToken } from '../src/authHelper';

const oauth = require('simple-oauth2');

describe('authHelper', () => {
  const outlookToken = require('./fixtures/outlook-token.json');
  beforeAll(() => {
    nock('https://login.microsoftonline.com')
        .post('/common/oauth2/v2.0/token', 'code=code&redirect_uri=http%3A%2F%2Fredirect&scope=read%20offline&grant_type=authorization_code&client_id=test%20id&client_secret=test%20secret')
        .reply(200, outlookToken)
        .post('/common/oauth2/v2.0/token', 'grant_type=refresh_token&refresh_token=refreshToken&client_id=test%20id&client_secret=test%20secret')
        .reply(200, outlookToken);
  });
  afterAll(() => {
    nock.restore();
  });
  describe('getAuthUrl', () => {
    it('should returu the correct outlook login url', () => {
      const credential = require('./fixtures/outlook-client.json');
      const oauth2 = oauth.create(credential);
      const result = getAuthUrl(oauth2, 'https://redirect', 'read offline', 'test');
      expect(result).to.equal('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?redirect_uri=https%3A%2F%2Fredirect&scope=read%20offline&access_type=offline&prompt=consent&state=test&response_type=code&client_id=test%20id');
    });
    it('should returu the correct google login url', () => {
      const credential = require('./fixtures/google-client.json');
      const oauth2 = oauth.create(credential);
      const result = getAuthUrl(oauth2, 'https://redirect', 'read offline', 'test');
      expect(result).to.equal('https://accounts.google.com/o/oauth2/auth?redirect_uri=https%3A%2F%2Fredirect&scope=read%20offline&access_type=offline&prompt=consent&state=test&response_type=code&client_id=test%20id');
    });
  });
  describe('getTokenFromCode', () => {
    it('should return the outlook token', () => {
      const credential = require('./fixtures/outlook-client.json');
      const oauth2 = oauth.create(credential);
      const result = getTokenFromCode(oauth2, 'code', 'http://redirect', 'read offline');
      return expect(result).to.eventually.have.property('token');
    });
  });
  describe('refreshAccessToken', () => {
    it('should success to refresh outlook token', () => {
      const credential = require('./fixtures/outlook-client.json');
      const oauth2 = oauth.create(credential);
      const result = refreshAccessToken(oauth2, 'refreshToken');
      return expect(result).to.eventually.have.property('token');
    });
  });
});
