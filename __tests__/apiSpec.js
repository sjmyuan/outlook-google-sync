import { expect } from 'chai';
import sinon from 'sinon';
import AWS from 'aws-sdk';
import * as api from '../src/api';

describe('api', () => {
  describe('fillInUser', () => {
    it('should return the key with actual user', () => {
      expect(api.fillInUser('config/%USER%/info.json', 'serverless')).to.equal('config/serverless/info.json');
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
      data = ['user1/', 'user2/'];
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
        expect(result).eventually.to.equal('success');
      });
    });
  });
});
