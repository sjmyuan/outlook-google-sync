import _ from 'lodash';

const oauth = require('simple-oauth2');

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
  getUser,
  updateUser,
  listFoldersInS3,
} from './api';

import ignoreSubject from './ignore-subject';

module.exports.login = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userPrefix = _.get(event, 'stageVariables.config_prefix');
  const userName = _.get(event, 'pathParameters.id');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const stage = _.get(event, 'requestContext.stage');
  const scope = process.env.scope;
  const type = process.env.mail_type;
  const clientPrefix = `${userPrefix}/${userName}/client/${type}`;

  readObjectFromS3(bucket, clientPrefix).then((client) => {
    const authUrl = getAuthUrl(oauth.create(client),
      `https://${event.headers.Host}/${stage}/${type}/${redirectPath}/${userName}`,
      scope.replace(/,/g, ' '));
    cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your ${type} account.</p>` });
  }).catch((err) => {
    cb(null, { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: JSON.stringify(err) });
  });
};

module.exports.authorize = (event, context, cb) => {
  const bucket = _.get(event, 'stageVariables.home_bucket');
  const userPrefix = _.get(event, 'stageVariables.user_prefix');
  const userName = _.get(event, 'pathParameters.id');
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host');
  const stage = _.get(event, 'requestContext.stage');
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const type = process.env.mail_type;
  const scope = process.env.scope;
  const clientPrefix = `${userPrefix}/${userName}/client/${type}`;
  const redirectUrl = `https://${host}/${stage}/${type}/${redirectPath}/${userName}`;
  const tokenPrefix = `${userPrefix}/${userName}/token/${type}`;

  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope is ${scope}`);

  readObjectFromS3(bucket, clientPrefix).then(client => getTokenFromCode(
      oauth.create(client),
      code,
      redirectUrl,
      scope.replace(/,/g, ' '),
    ).then(token => writeObjectToS3(bucket, tokenPrefix, token)).then(() => {
      console.log(`Success to authorize ${type} , user is ${userName}`);
      cb(null, { statusCode: 200, headers: {}, body: 'Success to login' });
    }).catch((err) => {
      console.log(`Failed to authorize,error message is ${err}`);
      cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize' });
    }));
};

module.exports.refresh_token = (event) => {
  const bucket = process.env.home_bucket;
  const userPrefix = process.env.user_prefix;
  const type = process.env.mail_type;
  listFoldersInS3(bucket, userPrefix)
    .then(users => Promise.all(_.map(users, (user) => {
      const clientPrefix = `${userPrefix}/${user}client/${type}`;
      const tokenPrefix = `${userPrefix}/${user}token/${type}`;
      return Promise.all([
        readObjectFromS3(bucket, clientPrefix),
        readObjectFromS3(bucket, tokenPrefix),
      ]).then((data) => {
        const client = data[0];
        const token = data[1];
        console.log('The token is');
        console.log(token);
        return refreshAccessToken(oauth.create(client), token.token.refresh_token)
        .then(newToken => writeObjectToS3(bucket, tokenPrefix, newToken));
      });
    }))).then(() => {
      console.log('Success to refresh token');
    }).catch((err) => {
      console.log(`Failed to refresh token,error is ${err}`);
    });
};

module.exports.fetch_events = (event) => {
  const bucket = process.env.home_bucket;
  const processedEventsKey = process.env.processed_events_key;
  const userPrefix = process.env.user_prefix;
  const src_type = process.env.src_mail_type;
  const tgt_type = process.env.tgt_mail_type;
  const syncDays = process.env.sync_days;
  const attendeesKey = process.env.attendees_key;

  Promise.all([
    listFoldersInS3(bucket, userPrefix),
    readObjectFromS3(bucket, processedEventsKey),
  ]).then((userAndEvent) => {
    const [users, processedEvents] = userAndEvent;
    return Promise.all(_.map(users, (user) => {
      const srcTokenPrefix = `${userPrefix}/${user}token/${src_type}`;
      const tgtTokenPrefix = `${userPrefix}/${user}token/${tgt_type}`;
      const userInfoPrefix = `${userPrefix}/${user}info.json`;
      return Promise.all([
        readObjectFromS3(bucket, srcTokenPrefix),
        readObjectFromS3(bucket, tgtTokenPrefix),
        readObjectFromS3(bucket, userInfoPrefix),
      ]).then((tokenAndInfo) => {
        const [srcToken, tgtToken, userInfo] = tokenAndInfo;
        return fetchOutlookEvents(srcToken.token.access_token, syncDays)
            .then((events) => {
              const newEvents = _.filter(
                events.value,
                message => (_.findIndex(processedEvents, ele => ele.iCalUId === message.iCalUId) < 0
                  && _.findIndex(userInfo.filters, ele => ele === message.subject) < 0),
              );
              return _.map(newEvents, ele => ({
                id: ele.iCalUId,
                info: userInfo,
                token: tgtToken,
                event: ele,
              }));
            });
      });
    }));
  }).then((events) => {
    const totalEvents = _.uniqBy(_.flatten(events), ele => ele.id);
    return writeObjectToS3(bucket, processedEventsKey, _.map(totalEvents, ele => ele.event))
        .then(() => {
          readObjectFromS3(bucket, attendeesKey).then(attendees => Promise.all(
              _.map(
                totalEvents,
                message => getAvailableRoom(message.info.rooms, message.event.start, message.event.end, message.token.token.access_token)
                  .then(room => createGoogleEvent(convertOutlookToGoogle(attendees, message.event, room), message.token.token.access_token)),
              )));
        });
  }).then(() => {
    console.log('Success to sync events');
  }).catch((err) => {
    console.log(`Failed to sync events, error message is ${err}`);
  });
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
    const allAttendees = _.reduce(newAttendees, (collect, attendee) => {
      if (_.findIndex(collect, ele => ele.outlook === attendee.oulook) < 0) {
        return _.concat(collect, attendee);
      }
      return collect;
    }, oldAttendees);
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
  console.log(event);
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
    const allUsers = _.reduce(newUsers, (collect, user) => {
      if (_.findIndex(collect, ele => ele.name === user.name) < 0) {
        return _.concat(collect, user);
      }
      return collect;
    }, oldUsers);
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
