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

const deleteMessages = (queueName, messages) => getQueueUrl(queueName).then(url => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  const entries = _.map(messages, message => ({ Id: message.Id, ReceiptHandle: message.ReceiptHandle }));
  sqs.deleteMessageBatch({ QueueUrl: url, Entries: entries }, (err, data) => {
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

const fetchOutlookEvents = (token, days) => {
  const startDate = new Date();
  console.log(`start date is ${startDate.toISOString()}`);
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  console.log(`end date is ${endDate.toISOString()}`);
  const uri = `https://graph.microsoft.com/v1.0/me/calendarview?startdatetime=${startDate.toISOString()}&enddatetime=${endDate.toISOString()}`;
  const option = {
    method: 'GET',
    uri,
    headers: {
      Prefer: ['outlook.timezone="Asia/Shanghai"'],
      Accept: 'application/json',
      'User-Agent': 'outlook-google-sync',
      'client-request-id': uuid.v4(),
      'return-client-request-id': 'true',
      authorization: `Bearer ${token}`,
    },
    json: true,
  };
  return rp(option).then((events) => {
    console.log(events.value[0].start);
    return events;
  });
};

const fetchGoogleEvents = (token, days) => {
  const startDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
  console.log(`start date is ${startDate.toISOString()}`);
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  console.log(`end date is ${endDate.toISOString()}`);
  const uri = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true`;
  console.log(`uri is ${uri}`);
  const option = {
    method: 'GET',
    uri,
    headers: {
      authorization: `Bearer ${token}`,
    },
    json: true,
  };
  return rp(option);
};

const convertOutlookToGoogle = event => ({
  summary: event.subject,
  location: '',
  description: event.bodyPreview,
  start: event.start,
  end: event.end,
  recurrence: [],
  attendees: [],
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 10 },
    ],
  },
});

const createGoogleEvent = (event, token) => {
  const uri = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendNotifications=true';
  console.log(`uri is ${uri}`);
  const option = {
    method: 'POST',
    uri,
    headers: {
      authorization: `Bearer ${token}`,
    },
    json: true,
    body: event,
  };
  return rp(option);
};

export { sendTopic,
  sendMessage,
  fetchMessage,
  getQueueUrl,
  purgeQueue,
  fetchOutlookEvents,
  fetchGoogleEvents,
  deleteMessages,
  convertOutlookToGoogle,
  createGoogleEvent,
};
