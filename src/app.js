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
  convertOutlookToGoogle,
  readObjectFromS3,
  writeObjectToS3,
} from './api';
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
        message => (_.isUndefined(_.find(processedEvents, ele => ele.id === message.id))
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

module.exports.add_room = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const configPrefix = _.get(event, 'stageVariables.config_prefix');
  const roomPrefix = `${configPrefix}/rooms.json`;
  const newRooms = JSON.parse(event.body);
  if (_.isNull(newRooms)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }

  console.log(`New rooms is ${newRooms}`);
  readObjectFromS3(bucket, roomPrefix, []).then((oldRooms) => {
    console.log(`Old rooms is ${oldRooms}`);
    const allRooms = _.concat(oldRooms, newRooms);
    console.log(`All rooms is ${allRooms}`);
    return writeObjectToS3(bucket, roomPrefix, allRooms).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(allRooms) });
      console.log('Success to add room');
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      console.log(`Failed to add room, error message is ${err}`);
    });
  });
};
module.exports.add_attendee = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const configPrefix = _.get(event, 'stageVariables.config_prefix');
  const attendeesPrefix = `${configPrefix}/attendees.json`;
  const newAttendees = JSON.parse(event.body);
  if (_.isNull(newAttendees)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }
  console.log(`New attendees is ${newAttendees}`);
  readObjectFromS3(bucket, attendeesPrefix, []).then((oldAttendees) => {
    console.log(`Old attendees is ${oldAttendees}`);
    const allAttendees = _.concat(oldAttendees, newAttendees);
    console.log(`All attendees is ${allAttendees}`);
    return writeObjectToS3(bucket, attendeesPrefix, allAttendees).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(allAttendees) });
      console.log('Success to add attendee');
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      console.log(`Failed to add attendee, error message is ${err}`);
    });
  });
};

module.exports.add_user = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const configPrefix = _.get(event, 'stageVariables.config_prefix');
  const userPrefix = `${configPrefix}/users.json`;
  const newUsers = JSON.parse(event.body);
  if (_.isNull(newUsers)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }
  console.log(`New users is ${newUsers}`);
  readObjectFromS3(bucket, userPrefix, []).then((oldUsers) => {
    console.log(`Old users is ${oldUsers}`);
    const allUsers = _.concat(oldUsers, newUsers);
    console.log(`All users is ${allUsers}`);
    return writeObjectToS3(bucket, userPrefix, allUsers).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(allUsers) });
      console.log('Success to add user');
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      console.log(`Failed to add user, error message is ${err}`);
    });
  });
};

module.exports.add_filter = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const configPrefix = _.get(event, 'stageVariables.config_prefix');
  const filterPrefix = `${configPrefix}/filters.json`;
  const newFilters = JSON.parse(event.body);
  if (_.isNull(newFilters)) {
    cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Request body is null' });
    console.log('Request body is null');
    return false;
  }
  console.log(`New filters is ${newFilters}`);
  readObjectFromS3(bucket, filterPrefix, []).then((oldFilters) => {
    console.log(`Old filters is ${oldFilters}`);
    const allFilters = _.concat(oldFilters, newFilters);
    console.log(`All filters is ${allFilters}`);
    return writeObjectToS3(bucket, filterPrefix, allFilters).then(() => {
      cb(null, { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(allFilters) });
      console.log('Success to add filter');
    }).catch((err) => {
      cb(null, { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(err) });
      console.log(`Failed to add filter, error message is ${err}`);
    });
  });
};
