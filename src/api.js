import AWS from 'aws-sdk';
import _ from 'lodash';
import rp from 'request-promise-native';
import uuid from 'node-uuid';

const getQueueUrl = queueName => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  sqs.getQueueUrl({ QueueName: queueName }, (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data.QueueUrl);
    }
  });
});

const fetchMessage = queueName =>
  getQueueUrl(queueName).then(url => new Promise((resolve, reject) => {
    const sqs = new AWS.SQS();
    sqs.receiveMessage({ QueueUrl: url }, (err, data) => {
      if (err) reject(err);
      else if (_.isEmpty(data.Messages)) reject('Token is empty');
      else resolve(data);
    });
  }));

const sendMessage = (queueName, message) => getQueueUrl(queueName).then(url => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  sqs.sendMessage({ QueueUrl: url, MessageBody: message }, (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });
}));

const purgeQueue = queueName => getQueueUrl(queueName).then(url => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  sqs.purgeQueue({ QueueUrl: url }, (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });
}));

const sendTopic = (topicArn, message) => new Promise((resolve, reject) => {
  const sns = new AWS.SNS();
  sns.publish({ TopicArn: topicArn, Message: message }, (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });
});

const fetchNoSyncEvents = (token, days) => {
  const startDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
  console.log(`start date is ${startDate.toISOString()}`);
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  console.log(`end date is ${endDate.toISOString()}`);
  const uri = `https://graph.microsoft.com/v1.0/me/calendarview?startdatetime=${startDate.toISOString()}&enddatetime=${endDate.toISOString()}`;
  const option = {
    method: 'GET',
    uri,
    headers: {
      Prefer: ['outlook.timezone="China Standard Time"'],
      Accept: 'application/json',
      'User-Agent': 'outlook-google-sync',
      'client-request-id': uuid.v4(),
      'return-client-request-id': 'true',
      authorization: `Bearer ${token}`,
    },
    json: true,
  };
  return rp(option);
};

export { sendTopic, sendMessage, fetchMessage, getQueueUrl, purgeQueue, fetchNoSyncEvents };
