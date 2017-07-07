import AWS from 'aws-sdk';
import _ from 'lodash';

const MicrosoftGraph = require('../node_modules/@microsoft/microsoft-graph-client/lib/src/index.js');

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

const fetchNoSyncEvents = (token, days) => new Promise((resolve, reject) => {
  const client = MicrosoftGraph.Client.init({
    debugLogging: true,
    authProvider: (done) => {
      done(null, token);
    },
  });
  const startDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
  console.log(`start date is ${startDate.toISOString()}`);
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  console.log(`end date is ${endDate.toISOString()}`);
  return client.api(`/me/calendarview?StartDateTime=${startDate.toISOString()}&EndDateTime=${endDate.toISOString()}`)
    .headers({ Prefer: 'outlook.timezone="China Standard Time"' })
    .select('subject,start,end,responseStatus,isCancelled')
    .get((err, res) => {
      if (err) {
        reject(err);
      } else {
        console.log(res);
        resolve(res);
      }
    });
});

export { sendTopic, sendMessage, fetchMessage, getQueueUrl, purgeQueue, fetchNoSyncEvents };
