import _ from 'lodash';
import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import { fetchMessage, sendMessage, deleteMessages, purgeQueue, fetchGoogleEvents, fetchOutlookEvents, createGoogleEvent, convertOutlookToGoogle } from './api';
import { googleAuth, outlookAuth } from './credential';

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
      return data;
    }),
    fetchMessage(googleQueueName).then((data) => {
      if (_.isEmpty(data.Messages)) {
        return Promise.reject('Google token is empty');
      }
      return data;
    }),
    fetchMessage(processedQueueName).then(message => _.map(message.Messages, ele => ele.Body)),
  ]).then((data) => {
    console.log('outlook token is');
    console.log(data[0]);
    console.log('google token is');
    console.log(data[1]);
    console.log('processed event is');
    console.log(data[2]);
    const outlookToken = JSON.parse(data[0].Messages[0].Body);
    const googleToken = JSON.parse(data[1].Messages[0].Body);
    return fetchOutlookEvents(outlookToken.token.access_token, syncDays)
    .then((outlookEvents) => {
      const newEvents = _.filter(outlookEvents.value, message => !_.includes(data[1], message.id));
      console.log(`Unprocessed events ${newEvents}`);
      return Promise.all(_.map(newEvents, (message) => {
        createGoogleEvent(convertOutlookToGoogle(message), googleToken.token.access_token)
          .then(() => sendMessage(processedQueueName, message.id));
      }));
    });
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
  });
};
