import _ from 'lodash';

const oauth = require('simple-oauth2');

import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';
import {
  addUser,
  updateAttendees,
  syncEvents,
  refreshTokens,
  authorize,
  getLoginUrl,
  getUserInfo,
  saveUserBasicInfo,
} from './api';

import {
  sign,
  verify,
} from './token';

import bcrypt from 'bcrypt-nodejs';

module.exports.login = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const tokenKey = _.get(event, 'stageVariables.token_key');
  const userName = _.get(event, 'queryStringParameters.id');
  const token = _.get(event, 'queryStringParameters.token');
  const stage = _.get(event, 'requestContext.stage');
  const scope = process.env.scope;
  const redirectPath = process.env.redirect_path;
  const clientKeyTpl = process.env.client_key;
  const redirectUrl = `https://${event.headers.Host}/${stage}/${redirectPath}`;
  verify(token, tokenKey, userName).then(() => {
    getLoginUrl(userName, bucket, clientKeyTpl, redirectUrl, scope).then((url) => {
      cb(null, { statusCode: 302, headers: { location: url } });
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: JSON.stringify(err) });
    });
  }).catch(() => {
    cb(null, { statusCode: 401 });
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
  const emailAddress = process.env.email_address;
  const emailPassword = process.env.email_password;
  const emailServer = {
    user: emailAddress,
    pass: emailPassword,
  };

  syncEvents(bucket,
    processedEventsKey,
    userHomeKey,
    userInfoKeyTpl,
    srcTokenKeyTpl,
    tgtTokenKeyTpl,
    syncDays,
    attendeesKey,
    emailServer,
  ).then(() => {
    console.log('Success to sync events');
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
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
    password: bcrypt.hashSync(newUser.password),
    rooms: [],
    filters: [],
  };

  console.log(`New user is ${newUser}`);
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const googleClientKeyTpl = _.get(event, 'stageVariables.google_client_key');
  const outlookClientKeyTpl = _.get(event, 'stageVariables.outlook_client_key');
  const userHomeKey = _.get(event, 'stageVariables.user_home_key');
  const tokenKey = _.get(event, 'stageVariables.token_key');
  addUser(userInfo, bucket, userHomeKey, userInfoKeyTpl, googleClientKeyTpl, outlookClientKeyTpl, googleClient, outlookClient)
    .then(() => sign(newUser.name, tokenKey))
    .then((token) => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ token }) });
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
  const tokenKey = _.get(event, 'stageVariables.token_key');

  getUserInfo(newUser.name, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, '', '')
    .then((data) => {
      console.log('user info:');
      console.log(data);
      console.log(`login password:${newUser.password}`);
      if (!bcrypt.compareSync(newUser.password, data.info.password)) { return Promise.reject('password is wrong'); }
    }).then(() => sign(newUser.name, tokenKey))
    .then((token) => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ token }) });
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
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const outlookTokenKeyTpl = _.get(event, 'stageVariables.outlook_token_key');
  const googleTokenKeyTpl = _.get(event, 'stageVariables.google_token_key');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');
  const tokenKey = _.get(event, 'stageVariables.token_key');
  const token = _.get(event, 'headers.email-token');
  const googleLoginUrl = `https://${event.headers.Host}/${stage}/${googleLoginPath}?id=${userName}&token=${token}`;
  const outlookLoginUrl = `https://${event.headers.Host}/${stage}/${outlookLoginPath}?id=${userName}&token=${token}`;

  verify(token, tokenKey, userName).then(() => {
    getUserInfo(userName, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, googleLoginUrl, outlookLoginUrl)
      .then((data) => {
        delete data.info.password;
        cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
      }).catch((err) => {
        cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      });
  }).catch(() => {
    cb(null, { statusCode: 401 });
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
  const tokenKey = _.get(event, 'stageVariables.token_key');
  const token = _.get(event, 'headers.email-token');

  verify(token, tokenKey, data.info.name).then(() => {
    getUserInfo(data.info.name, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, '', '')
      .then((oldInfo) => {
        const userInfo = oldInfo.info;
        userInfo.rooms = data.info.rooms;
        userInfo.filters = data.info.filters;

        return Promise.all([
          saveUserBasicInfo(userInfo, bucket, userInfoKeyTpl),
          updateAttendees(data.attendees, bucket, attendeesKey),
        ]);
      }).then(() => {
        cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'success' });
      }).catch((err) => {
        cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      });
  }).catch(() => {
    cb(null, { statusCode: 401 });
  });
};

module.exports.reset_password = (event, context, cb) => {
  console.log(event);
  const resetData = JSON.parse(event.body);
  if (!_.has(resetData, 'oldPassword')) {
    cb(null, { statusCode: 400, body: 'can not find old password' });
    console.log('can not find old password');
    return false;
  }

  if (!_.has(resetData, 'newPassword')) {
    cb(null, { statusCode: 400, body: 'can not find new password' });
    console.log('can not find new password');
    return false;
  }

  if (!_.has(resetData, 'name')) {
    cb(null, { statusCode: 400, body: 'can not find name' });
    console.log('can not find name');
    return false;
  }

  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userInfoKeyTpl = _.get(event, 'stageVariables.user_info_key');
  const outlookTokenKeyTpl = _.get(event, 'stageVariables.outlook_token_key');
  const googleTokenKeyTpl = _.get(event, 'stageVariables.google_token_key');
  const attendeesKey = _.get(event, 'stageVariables.attendees_key');

  getUserInfo(resetData.name, bucket, userInfoKeyTpl, googleTokenKeyTpl, outlookTokenKeyTpl, attendeesKey, '', '')
    .then((data) => {
      console.log('user info:');
      console.log(data);
      const userInfo = data.info;
      if (!_.has(userInfo, 'password') || bcrypt.compareSync(resetData.oldPassword, userInfo.password)) {
        userInfo.password = bcrypt.hashSync(resetData.newPassword);
        return saveUserBasicInfo(userInfo, bucket, userInfoKeyTpl).then(() => {
          cb(null, { statusCode: 200, body: JSON.stringify('success') });
        });
      }
      cb(null, { statusCode: 401 });
      return '';
    }).catch((err) => {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    });
};
