import _ from 'lodash';
import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import { fetchMessage,
  sendMessage,
  deleteMessages,
  purgeQueue,
  fetchGoogleEvents,
  fetchOutlookEvents,
  createGoogleEvent,
  getAvailableRoom,
  convertOutlookToGoogle } from './api';
import { googleAuth, outlookAuth } from './credential';

import ignoreSubject from './ignore-subject';

module.exports.outlook_login = (event, context, cb) => {
  const scope = _.get(event, 'stageVariables.outlook_scope');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const stage = _.get(event, 'requestContext.stage');
  const authUrl = getAuthUrl(outlookAuth, `https://${event.headers.Host}/${stage}/outlook/${redirectPath}`, scope.replace(/,/g, ' '));
  cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your Office 365 or Outlook.com account.</p>` });
  return true;
};

module.exports.outlook_authorize = (event, context, cb) => {
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host');
  const stage = _.get(event, 'requestContext.stage');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const scope = _.get(event, 'stageVariables.outlook_scope');
  const queueName = _.get(event, 'stageVariables.outlook_queue_name');
  const redirectUrl = `https://${host}/${stage}/outlook/${redirectPath}`;
  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope url is ${scope}`);
  getTokenFromCode(outlookAuth, code, redirectUrl, scope.replace(/,/g, ' '))
    .then(token => purgeQueue(queueName).then(() => sendMessage(queueName, JSON.stringify(token)))).then((data) => {
      cb(null, { statusCode: 200, headers: {}, body: 'Success to login' });
    },
  ).catch((err) => {
    console.log(`Failed to authorize,error message is ${err}`);
    cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize' });
  });
  return true;
};

module.exports.google_login = (event, context, cb) => {
  const scope = _.get(event, 'stageVariables.google_scope');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const stage = _.get(event, 'requestContext.stage');
  const authUrl = getAuthUrl(googleAuth, `https://${event.headers.Host}/${stage}/google/${redirectPath}`, scope.replace(/,/g, ' '));
  cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your Gmail account.</p>` });
  return true;
};

module.exports.google_authorize = (event, context, cb) => {
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host');
  const stage = _.get(event, 'requestContext.stage');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const scope = _.get(event, 'stageVariables.google_scope');
  const queueName = _.get(event, 'stageVariables.google_queue_name');
  const redirectUrl = `https://${host}/${stage}/google/${redirectPath}`;
  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope url is ${scope}`);
  getTokenFromCode(googleAuth, code, redirectUrl, scope.replace(/,/g, ' '))
    .then(token => purgeQueue(queueName).then(() => sendMessage(queueName, JSON.stringify(token)))).then((data) => {
      cb(null, { statusCode: 200, headers: {}, body: 'Success to login' });
    },
  ).catch((err) => {
    console.log(`Failed to authorize,error message is ${err}`);
    cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize' });
  });
  return true;
};
module.exports.refresh_token = (event) => {
  const outlookQueueName = process.env.outlook_queue_name;
  const googleQueueName = process.env.google_queue_name;
  Promise.all([
    fetchMessage(outlookQueueName).then((message) => {
      console.log('The outlook message is');
      console.log(message);
      if (_.isEmpty(message.Messages)) {
        return Promise.reject('Outlook token is empty');
      }
      const token = JSON.parse(message.Messages[0].Body);
      console.log('The outlook token is');
      console.log(token);
      return refreshAccessToken(outlookAuth, token.token.refresh_token)
        .then(data => sendMessage(outlookQueueName, JSON.stringify(data)))
        .then(() => deleteMessages(outlookQueueName, message.Messages));
    }),
    fetchMessage(googleQueueName).then((message) => {
      console.log('The google message is');
      console.log(message);
      if (_.isEmpty(message.Messages)) {
        return Promise.reject('Google token is empty');
      }
      const token = JSON.parse(message.Messages[0].Body);
      console.log('The google token is');
      console.log(token);
      return refreshAccessToken(googleAuth, token.token.refresh_token)
        .then(data => sendMessage(googleQueueName, JSON.stringify(data)))
        .then(() => deleteMessages(googleQueueName, message.Messages));
    }),
  ]).then((data) => {
    console.log('Success to refresh token');
  }).catch((err) => {
    console.log(`Failed to refresh token,error is ${err}`);
  });
  return true;
};

module.exports.sync_events = (event) => {
  const syncDays = process.env.sync_days;
  const outlookQueueName = process.env.outlook_queue_name;
  const googleQueueName = process.env.google_queue_name;
  const processedQueueName = process.env.processed_queue_name;
  Promise.all([
    fetchMessage(outlookQueueName).then((data) => {
      if (_.isEmpty(data.Messages)) {
        return Promise.reject('Outlook token is empty');
      }
      return JSON.parse(data.Messages[0].Body);
    }),
    fetchMessage(googleQueueName).then((data) => {
      if (_.isEmpty(data.Messages)) {
        return Promise.reject('Google token is empty');
      }
      return JSON.parse(data.Messages[0].Body);
    }),
    fetchMessage(processedQueueName),
  ]).then((data) => {
    const outlookToken = data[0];
    const googleToken = data[1];
    const processedInfo = data[2];

    console.log('outlook token is');
    console.log(outlookToken);
    console.log('google token is');
    console.log(googleToken);
    console.log('processed event is');
    console.log(processedInfo);

    let processedEvents = [];
    if (!_.isEmpty(processedInfo.Messages)) {
      processedEvents = JSON.parse(processedInfo.Messages[0].Body);
    }

    return fetchOutlookEvents(outlookToken.token.access_token, syncDays)
    .then((outlookEvents) => {
      const newEvents = _.filter(
        outlookEvents.value,
        message => _.isUndefined(_.find(processedEvents, ele => ele.id === message.id)
            && _.isUndefined(_.find(ignoreSubject, ele => ele === message.subject))),
      );
      console.log(`Unprocessed events ${newEvents}`);
      return sendMessage(processedQueueName, JSON.stringify(outlookEvents.value))
        .then(() => deleteMessages(processedQueueName, processedInfo.Messages))
        .then(() => Promise.all(
          _.map(
            newEvents,
            message => getAvailableRoom(message.start, message.end, googleToken.token.access_token)
              .then(room => createGoogleEvent(convertOutlookToGoogle(message, room), googleToken.token.access_token)),
          )),
        );
    });
  }).then(() => {
    console.log('Success to sync events');
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
  });
};