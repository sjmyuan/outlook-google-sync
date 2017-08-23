import _ from 'lodash';

const oauth = require('simple-oauth2');

import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import {
  addUser,
  addAttendees,
  deleteAttendees,
  syncEvents,
  refreshTokens,
  authorize,
  getLoginUrl,
  getUserInfo,
  saveUserBasicInfo,
} from './api';

module.exports.login = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userName = _.get(event, 'queryStringParameters.id');
  const stage = _.get(event, 'requestContext.stage');
  const scope = process.env.scope;
  const redirectPath = process.env.redirect_path;
  const clientKeyTpl = process.env.client_key;
  const redirectUrl = `https://${event.headers.Host}/${stage}/${redirectPath}`;
  getLoginUrl(userName, bucket, clientKeyTpl, redirectUrl, scope).then((url) => {
    cb(null, { statusCode: 302, headers: { location: url } });
  }).catch((err) => {
    cb(null, { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: JSON.stringify(err) });
  });
};

module.exports.authorize = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userName = _.get(event, 'queryStringParameters.state');
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host');
  const stage = _.get(event, 'requestContext.stage');
  const redirectPath = process.env.redirect_path;
  const clientKeyTpl = process.env.client_key;
  const tokenKeyTpl = process.env.token_key;
  const scope = process.env.scope;
  const redirectUrl = `https://${host}/${stage}/${redirectPath}`;

  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope is ${scope}`);

  authorize(userName, bucket, clientKeyTpl, tokenKeyTpl, code, redirectUrl, scope).then(() => {
    console.log(`Success to authorize, user is ${userName}`);
    cb(null, { statusCode: 200, headers: {}, body: 'Success to login' });
  }).catch((err) => {
    console.log(`Failed to authorize,error message is ${err}`);
    cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize' });
  });
};

module.exports.refresh_token = (event) => {
  const bucket = process.env.home_bucket;
  const userHomeKey = process.env.user_home_key;
  const clientKeyTpl = process.env.client_key;
  const tokenKeyTpl = process.env.token_key;
  refreshTokens(bucket, userHomeKey, clientKeyTpl, tokenKeyTpl).then(() => {
    console.log('Success to refresh token');
  }).catch((err) => {
    console.log(`Failed to refresh token,error is ${err}`);
  });
};

module.exports.sync_events = (event) => {
  const bucket = process.env.home_bucket;
  const processedEventsKey = process.env.processed_events_key;
  const userHomeKey = process.env.user_home_key;
  const userInfoKeyTpl = process.env.user_info_key;
  const srcTokenKeyTpl = process.env.src_token_key;
  const tgtTokenKeyTpl = process.env.tgt_token_key;
  const syncDays = process.env.sync_days;
  const attendeesKey = process.env.attendees_key;

  syncEvents(bucket,
    processedEventsKey,
    userHomeKey,
    userInfoKeyTpl,
    srcTokenKeyTpl,
    tgtTokenKeyTpl,
    syncDays,
    attendeesKey,
  ).then(() => {
    console.log('Success to sync events');
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
  });
};

module.exports.add_attendee = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');
  const newAttendees = JSON.parse(event.body);
  if (_.isNull(newAttendees)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }
  console.log(`New attendees is ${newAttendees}`);
  addAttendees(newAttendees, bucket, attendeesKey)
      .then(() => {
        cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: 'Success to add attendees' });
        console.log('Success to add attendee');
      }).catch((err) => {
        cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
        console.log(`Failed to add attendee, error message is ${err}`);
      });
};

module.exports.delete_attendee = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');
  const attendees = JSON.parse(event.body);
  if (_.isNull(attendees)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }
  console.log('Delete attendees is:');
  console.log(attendees);
  deleteAttendees(attendees, bucket, attendeesKey)
      .then(() => {
        cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: 'Success to add attendees' });
        console.log('Success to delete attendee');
      }).catch((err) => {
        cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
        console.log(`Failed to delete attendee, error message is ${err}`);
      });
};

module.exports.add_user = (event, context, cb) => {
  console.log(event);
  const newUser = JSON.parse(event.body);
  if (!_.has(newUser, 'name')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find user name' });
    console.log('can not find user name');
    return false;
  }

  if (!_.has(newUser, 'password')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find user password' });
    console.log('can not find user password');
    return false;
  }

  const googleClient = {
    id: process.env.google_client_id,
    secret: process.env.google_client_secret,
  };

  const outlookClient = {
    id: process.env.outlook_client_id,
    secret: process.env.outlook_client_secret,
  };

  const userInfo = {
    name: newUser.name,
    password: newUser.password,
    rooms: [],
    filters: [],
  };

  console.log(`New user is ${newUser}`);
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const googleClientKeyTpl = _.get(event, 'stageVariables.google_client_key');
  const outlookClientKeyTpl = _.get(event, 'stageVariables.outlook_client_key');
  const userHomeKey = _.get(event, 'stageVariables.user_home_key');
  addUser(userInfo, bucket, userHomeKey, userInfoKeyTpl, googleClientKeyTpl, outlookClientKeyTpl, googleClient, outlookClient)
    .then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Success to add user' });
      console.log('Success to add user');
    })
    .catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      console.log(`Failed to add user, error message is ${err}`);
    });
};

module.exports.login_user = (event, context, cb) => {
  console.log(event);
  const newUser = JSON.parse(event.body);
  if (!_.has(newUser, 'name')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find user name' });
    console.log('can not find user name');
    return false;
  }

  if (!_.has(newUser, 'password')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find user password' });
    console.log('can not find user password');
    return false;
  }

  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const outlookTokenKeyTpl = _.get(event, 'stageVariables.outlook_token_key');
  const googleTokenKeyTpl = _.get(event, 'stageVariables.google_token_key');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');

  getUserInfo(newUser.name, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, '', '')
    .then((data) => {
      if (data.info.password !== newUser.password) { return Promise.reject('password is wrong'); }
      return '';
    }).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'success' });
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
    });
};

module.exports.get_user_config = (event, context, cb) => {
  console.log(event);
  const userName = _.get(event, 'queryStringParameters.id');
  const stage = _.get(event, 'requestContext.stage');
  const googleLoginPath = _.get(event, 'stageVariables.google_login_path');
  const outlookLoginPath = _.get(event, 'stageVariables.outlook_login_path');
  const googleLoginUrl = `https://${event.headers.Host}/${stage}/${googleLoginPath}?id=${userName}`;
  const outlookLoginUrl = `https://${event.headers.Host}/${stage}/${outlookLoginPath}?id=${userName}`;
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const outlookTokenKeyTpl = _.get(event, 'stageVariables.outlook_token_key');
  const googleTokenKeyTpl = _.get(event, 'stageVariables.google_token_key');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');

  getUserInfo(userName, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, googleLoginUrl, outlookLoginUrl)
    .then((data) => {
      delete data.info.password
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
    });
};

module.exports.save_user_config = (event, context, cb) => {
  console.log(event);
  const data = JSON.parse(event.body);
  if (!_.has(data, 'info.name')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find user name' });
    console.log('can not find user name');
    return false;
  }

  if (!_.has(data, 'info.rooms')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find rooms' });
    console.log('can not find user rooms');
    return false;
  }

  if (!_.has(data, 'info.filters')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find filters' });
    console.log('can not find user filters');
    return false;
  }

  if (!_.has(data, 'attendees')) {
    cb(null, { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'can not find attendees' });
    console.log('can not find attendees');
    return false;
  }

  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const outlookTokenKeyTpl = _.get(event, 'stageVariables.outlook_token_key');
  const googleTokenKeyTpl = _.get(event, 'stageVariables.google_token_key');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');

  getUserInfo(data.info.name, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, '', '')
    .then((oldInfo) => {
      const userInfo = oldInfo.info;
      userInfo.rooms = data.info.rooms;
      userInfo.filters = data.info.filters;

      return Promise.all([
        saveUserBasicInfo(userInfo, bucket, userInfoKeyTpl),
        addAttendees(data.attendees, bucket, attendeesKey),
      ]);
    }).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'success' });
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
    });
};
