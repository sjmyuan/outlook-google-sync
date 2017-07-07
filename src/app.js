import _ from 'lodash';
import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import { fetchMessage, sendMessage, sendTopic, purgeQueue } from './api';

module.exports.login = (event, context, cb) => {
  const scope = _.get(event, 'stageVariables.scope');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const stage = _.get(event, 'requestContext.stage');
  const authUrl = getAuthUrl(`https://${event.headers.Host}/${stage}/${redirectPath}`, scope.replace(/,/g, ' '));
  cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your Office 365 or Outlook.com account.</p>` });
  return true;
};

module.exports.authorize = (event, context, cb) => {
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host');
  const stage = _.get(event, 'requestContext.stage');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const scope = _.get(event, 'stageVariables.scope');
  const queueName = _.get(event, 'stageVariables.queue_name');
  const redirectUrl = `https://${host}/${stage}/${redirectPath}`;
  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope url is ${scope}`);
  getTokenFromCode(code, redirectUrl, scope.replace(/,/g, ' ')).then(token => sendMessage(queueName, JSON.stringify(token))).then((data) => {
    cb(null, { statusCode: 200, headers: {}, body: 'Success to login' });
  },
  ).catch((err) => {
    console.log(`Failed to authorize,error message is ${err}`);
    cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize' });
  });
  return true;
};

module.exports.refresh_token = (event) => {
  const queueName = process.env.queue_name;
  fetchMessage(queueName).then((message) => {
    console.log('The message is');
    console.log(message);
    const token = JSON.parse(message.Messages[0].Body);
    console.log('The token is');
    console.log(token);
    return refreshAccessToken(token.token.refresh_token);
  }).then(token => purgeQueue(queueName).then(data => sendMessage(queueName, JSON.stringify(token)))).catch((error) => {
    console.log(`Failed to refresh token, error message is ${error}`);
  });
  return true;
};

modele.exports.sync_events = (event) => {
  const syncDays = process.env.sync_days;
  const queueName = process.env.queue_name;
  fetchMessage(queueName).then(token => fetchNoSyncEvents(token.token.access_token, sync_days))
    .then(events => Promise.all(_.map(events, outlookEvent => createGmailEventFromOutlookEvent(outlookEvent))))
    .then((data) => {
      console.log('Success to synchronize events');
    }).catch((err) => {
      console.log(`Failed to synchronize events, error message is ${err}`);
    });
};
