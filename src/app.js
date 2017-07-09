import _ from 'lodash';
import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import { fetchMessage, sendMessage, sendTopic, purgeQueue, fetchGoogleEvents, fetchOutlookEvents } from './api';
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
  console.log('1');
  const scope = _.get(event, 'stageVariables.google_scope');
  console.log('2');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  console.log('3');
  const stage = _.get(event, 'requestContext.stage');
  console.log('4');
  const authUrl = getAuthUrl(googleAuth, `https://${event.headers.Host}/${stage}/google/${redirectPath}`, scope.replace(/,/g, ' '));
  console.log('5');
  cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your Gmail account.</p>` });
  console.log('6');
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
  const oulookQueueName = process.env.outlook_queue_name;
  const googleQueueName = process.env.google_queue_name;
  Promise.all([
    fetchMessage(oulookQueueName).then((message) => {
      console.log('The outlook message is');
      console.log(message);
      const token = JSON.parse(message.Messages[0].Body);
      console.log('The outlook token is');
      console.log(token);
      return refreshAccessToken(outlookAuth, token.token.refresh_token);
    }).then(token => purgeQueue(oulookQueueName).then(data => sendMessage(oulookQueueName, JSON.stringify(token)))),
    fetchMessage(googleQueueName).then((message) => {
      console.log('The google message is');
      console.log(message);
      const token = JSON.parse(message.Messages[0].Body);
      console.log('The google token is');
      console.log(token);
      return refreshAccessToken(googleAuth, token.token.refresh_token);
    }).then(token => purgeQueue(googleQueueName).then(data => sendMessage(googleQueueName, JSON.stringify(token)))),
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
  Promise.all([
    fetchMessage(outlookQueueName).then(token => fetchOutlookEvents(token.token.access_token, syncDays)),
    fetchMessage(googleQueueName).then(token => fetchGoogleEvents(token.token.access_token, syncDays)),
  ]).then((data) => {
    console.log(`outlook event is ${data[0]}`);
    console.log(`google event is ${data[1]}`);
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
  });
};
