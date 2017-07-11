import AWS from 'aws-sdk';
import _ from 'lodash';
import rp from 'request-promise-native';
import uuid from 'node-uuid';
import rooms from './rooms.js';
import moment from 'moment-timezone';
import attendees from './attendees';

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
  if (_.isEmpty(messages)) {
    resolve('success');
  } else {
    const entries = _.map(messages, message => ({ Id: message.MessageId, ReceiptHandle: message.ReceiptHandle }));
    console.log(entries);
    sqs.deleteMessageBatch({ QueueUrl: url, Entries: entries }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  }
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

const convertOutlookToGoogle = (event, room) => {
  const validAttendees = _.filter(
    _.map(event.attendees, attendee => ({ email: attendees[attendee.emailAddress.address] })),
    attendee => !_.isUndefined(attendee.email));
  validAttendees.push({ email: room.id });
  return {
    summary: event.subject,
    location: room.title,
    description: event.bodyPreview,
    start: event.start,
    end: event.end,
    recurrence: [],
    attendees: validAttendees,
    reminders: {
      useDefault: false,
      overrides: [
      { method: 'popup', minutes: 10 },
      ],
    },
  };
};

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

const convertTime = (time, targetZone) => {
  const srcTime = moment.tz(time.dateTime, time.timeZone);
  const targetTime = srcTime.clone().tz(targetZone);
  return targetTime.format();
};

const getAvailableRoom = (start, end, token) => {
  const uri = 'https://www.googleapis.com/calendar/v3/freeBusy';
  const option = {
    method: 'POST',
    uri,
    headers: {
      authorization: `Bearer ${token}`,
    },
    json: true,
    body: {
      timeMin: convertTime(start, 'Asia/Shanghai'),
      timeMax: convertTime(end, 'Asia/Shanghai'),
      timeZone: 'Asia/Shanghai',
      items: rooms,
    },
  };
  return rp(option).then((data) => {
    console.log('free busy data is ');
    console.log(data);
    const availableRoom = _.find(rooms, room => _.isEmpty(data.calendars[room.id].busy));
    if (_.isUndefined(availableRoom)) {
      return Promise.reject('There is no available room');
    }
    return availableRoom;
  });
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
  getAvailableRoom,
};
