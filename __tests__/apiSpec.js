import { expect } from 'chai';
import sinon from 'sinon';
import AWS from 'aws-sdk';
import * as api from '../src/api';

describe('api', () => {
  describe('fillInUser', () => {
    it('should return the key with actual user', () => {
      expect(api.fillInUser('config/=USER=/info.json', 'serverless')).to.equal('config/serverless/info.json');
    });
  });
  describe('readObjectFromS3', () => {
    let data = null;
    const getObject = sinon.stub().returns(
      {
        promise: () => Promise.resolve({ Body: JSON.stringify(data) }),
      },
    );
    beforeEach(() => {
      sinon.stub(AWS, 'S3').returns(
        {
          getObject,
        },
      );
    });
    afterEach(() => {
      AWS.S3.restore();
    });
    it('should return the user information with user info key', () => {
      data = require('./fixtures/user-info.json');
      const result = api.readObjectFromS3('bucket', 'user/info');
      getObject.should.have.been.calledWith({ Bucket: 'bucket', Key: 'user/info' });
      return expect(result).eventually.to.deep.equal(data);
    });
  });

  describe('writeObjectToS3', () => {
    const putObject = sinon.stub().returns(
      {
        promise: () => Promise.resolve('success'),
      },
    );
    beforeEach(() => {
      sinon.stub(AWS, 'S3').returns(
        {
          putObject,
        },
      );
    });
    afterEach(() => {
      AWS.S3.restore();
    });
    it('should return success', () => {
      const data = require('./fixtures/user-info.json');
      const result = api.writeObjectToS3('bucket', 'user/info', data);
      putObject.should.have.been.calledWith({ Bucket: 'bucket', Key: 'user/info', Body: JSON.stringify(data) });
      return expect(result).eventually.to.equal('success');
    });
  });

  describe('listFoldersInS3', () => {
    let data = null;
    const listObjects = sinon.stub().returns(
      {
        promise: () => Promise.resolve({ CommonPrefixes: data }),
      },
    );
    beforeEach(() => {
      sinon.stub(AWS, 'S3').returns(
        {
          listObjects,
        },
      );
    });
    afterEach(() => {
      AWS.S3.restore();
    });
    it('should return success', () => {
      data = [{ Prefix: 'config/users/user1/' }, { Prefix: 'config/users/user2/' }];
      const result = api.listFoldersInS3('bucket', 'config/users/');
      listObjects.should.have.been.calledWith({ Bucket: 'bucket', Delimiter: '/', Prefix: 'config/users/' });
      return expect(result).eventually.to.deep.equal(['user1', 'user2']);
    });
  });

  describe('addAttendees', () => {
    let getObjectReuslt = null;
    let putObjectResult = null;
    const getObject = sinon.stub().returns(
      {
        promise: () => getObjectReuslt,
      },
    );
    const putObject = sinon.stub().returns(
      {
        promise: () => putObjectResult,
      },
    );
    beforeEach(() => {
      sinon.stub(AWS, 'S3').returns(
        {
          getObject,
          putObject,
        },
      );
    });
    afterEach(() => {
      AWS.S3.restore();
    });
    describe('No attendees file in s3', () => {
      it('should return the empty array', () => {
        const newAttendees = require('./fixtures/attendees.json');
        getObjectReuslt = Promise.reject('no file');
        putObjectResult = Promise.resolve('success');
        const result = api.addAttendees(newAttendees, 'bucket', 'config/attendees.json');
        return expect(result).eventually.to.equal('success');
      });
    });
    describe('All duplicated attendees in s3', () => {
      it('should return the same attendees', () => {
        const newAttendees = require('./fixtures/attendees.json');
        getObjectReuslt = Promise.resolve({ Body: JSON.stringify(newAttendees) });
        putObjectResult = Promise.resolve('success');
        const result = api.addAttendees(newAttendees, 'bucket', 'config/attendees.json');
        return expect(result).eventually.to.equal('success');
      });
    });
    describe('Partial duplicated attendees in s3', () => {
      it('should return the merged attendees', () => {
        const newAttendees = require('./fixtures/attendees.json');
        const oldAttendees = [{ outlook: 'outlook', google: 'google' }];
        getObjectReuslt = Promise.resolve({ Body: JSON.stringify(oldAttendees) });
        putObjectResult = Promise.resolve('success');
        const result = api.addAttendees(newAttendees, 'bucket', 'config/attendees.json');
        return expect(result).eventually.to.equal('success');
      });
    });
  });

  describe('addUser', () => {
    const putObject = sinon.stub().returns({
      promise: () => Promise.resolve('success'),
    });

    let users = null;
    const listObjects = sinon.stub().returns(
      {
        promise: () => Promise.resolve({ CommonPrefixes: users }),
      },
    );

    beforeEach(() => {
      sinon.stub(AWS, 'S3').returns(
        {
          putObject,
          listObjects,
        },
      );
    });
    afterEach(() => {
      AWS.S3.restore();
    });
    it('should create the user structure', () => {
      const newUser = require('./fixtures/user-info.json');
      const outlookClient = {
        id: '1111111111111111',
        secret: '222222222222',
      };
      const googleClient = {
        id: '3333333333',
        secret: '444444444',
      };

      users = [{ Prefix: 'config/users/sync/' }];

      const result = api.addUser(newUser, 'bucket', 'config/users', 'config/=USER=/info.json', 'config/=USER=/client/google.json', 'config/=USER=/client/outlook.json', googleClient, outlookClient);

      // putObject.should.have.been.calledWith({ Bucket: 'bucket', Key: 'config/sync/info.json', Body: JSON.stringify(newUser) });
      // putObject.should.have.been.calledWith({
        // Body: '{"client":{"id":"3333333333","secret":"444444444"},"auth":{"tokenHost":"https://accounts.google.com","authorizePath":"o/oauth2/auth","tokenPath":"o/oauth2/token"}}',
        // Bucket: 'bucket',
        // Key: 'config/sync/client/google.json',
      // });
      // putObject.should.have.been.calledWith({
        // Body: '{"client":{"id":"1111111111111111","secret":"222222222222"},"auth":{"tokenHost":"https://login.microsoftonline.com","authorizePath":"common/oauth2/v2.0/authorize","tokenPath":"common/oauth2/v2.0/token"}}',
        // Bucket: 'bucket',
        // Key: 'config/sync/client/outlook.json',
      // });

      expect(result).eventually.to.deep.equal(['success', 'success', 'success']);
    });
  });
});
