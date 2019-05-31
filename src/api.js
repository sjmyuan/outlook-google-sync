import AWS from 'aws-sdk';
import _ from 'lodash';
import rp from 'request-promise-native';
import uuid from 'node-uuid';
import moment from 'moment-timezone';
import nodemailer from 'nodemailer';

import { getAuthUrl, getTokenFromCode, refreshAccessToken } from './authHelper';

const oauth = require('simple-oauth2');

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

// [{email:example@gmail.com},.....]
const mapAttendees = (allAttendees, eventAttendees) => eventAttendees.reduce((collect, attendee) => {
  const info = allAttendees.find(ele => ele.outlook === attendee.emailAddress.address);
  if (_.isUndefined(info)) {
    return collect;
  }

  if (_.isArray(info.google)) {
    return [...collect, ...(info.google.map(ele => ({ email: ele })))];
  }

  return [...collect, { email: info.google }];
}, []);

const convertOutlookToGoogle = (attendees, event, room) => {
  const validAttendees = mapAttendees(attendees, event.attendees);
  validAttendees.push({ email: room.id });
  return {
    summary: event.subject,
    location: room.title,
    description: event.bodyPreview,
    start: event.start,
    end: event.end,
    recurrence: [],
    attendees: validAttendees,
    guestsCanModify: true,
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

const deleteGoogleEvent = (eventId, token) => {
  const uri = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`;
  console.log(`uri is ${uri}`);
  const option = {
    method: 'DELETE',
    uri,
    headers: {
      authorization: `Bearer ${token}`,
    },
    json: true,
  };
  return rp(option);
};

const convertTime = (time, targetZone) => {
  const srcTime = moment.tz(time.dateTime, time.timeZone);
  const targetTime = srcTime.clone().tz(targetZone);
  return targetTime.format();
};

const getAvailableRoom = (rooms, start, end, token) => {
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
    const availableRoom = rooms.find(room => _.isEmpty(data.calendars[room.id].busy));
    if (_.isUndefined(availableRoom)) {
      return Promise.reject('There is no available room');
    }
    return availableRoom;
  });
};

const readObjectFromS3 = (bucket, key) => {
  const s3 = new AWS.S3();
  const getParams = {
    Bucket: bucket,
    Key: key,
  };
  return s3.getObject(getParams).promise()
    .then(data => JSON.parse(data.Body));
};

const objectExistInS3 = (bucket, key) => {
  const s3 = new AWS.S3();
  const params = {
    Bucket: bucket,
    Key: key,
  };
  return s3.headObject(params).promise()
    .then(() => true).catch(() => false);
};

const writeObjectToS3 = (bucket, key, obj) => {
  const s3 = new AWS.S3();
  const putParams = {
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(obj),
  };
  return s3.putObject(putParams).promise();
};

const listFoldersInS3 = (bucket, prefix) => {
  const s3 = new AWS.S3();
  const params = {
    Bucket: bucket,
    Delimiter: '/',
    Prefix: prefix,
  };
  return s3.listObjects(params).promise().then(data => data.CommonPrefixes.map(ele => ele.Prefix.replace(prefix, '').replace(/\/$/g, '')));
};

const fillInUser = (tpl, user) => tpl.replace(/=USER=/g, user);

const saveUserBasicInfo = (newUser, bucket, userInfoKeyTpl) => {
  const userInfoKey = fillInUser(userInfoKeyTpl, newUser.name);
  return writeObjectToS3(bucket, userInfoKey, newUser);
};

const addUser = (newUser, bucket, userHomeKey, userInfoKeyTpl, googleClientKeyTpl, outlookClientKeyTpl, google, outlook) => {
  const googleClientKey = fillInUser(googleClientKeyTpl, newUser.name);
  const outlookClientKey = fillInUser(outlookClientKeyTpl, newUser.name);
  const outlookClient = {
    client: outlook,
    auth: {
      tokenHost: 'https://login.microsoftonline.com',
      authorizePath: 'common/oauth2/v2.0/authorize',
      tokenPath: 'common/oauth2/v2.0/token',
    },
  };
  const googleClient = {
    client: google,
    auth: {
      tokenHost: 'https://accounts.google.com',
      authorizePath: 'o/oauth2/auth',
      tokenPath: 'o/oauth2/token',
    },
  };

  return listFoldersInS3(bucket, userHomeKey).then((users) => {
    if (users.findIndex(ele => ele === newUser.name) >= 0) {
      return Promise.reject(`${newUser.name} already exist`);
    }
  }).then(() => Promise.all([
    saveUserBasicInfo(newUser, bucket, userInfoKeyTpl),
    writeObjectToS3(bucket, googleClientKey, googleClient),
    writeObjectToS3(bucket, outlookClientKey, outlookClient),
  ]));
};

const updateAttendees = (newAttendees, bucket, attendeesKeyTpl, user) => {
  const attendeesKey = fillInUser(attendeesKeyTpl, user);
  console.log('New attendees are ');
  console.log(newAttendees);
  return writeObjectToS3(bucket, attendeesKey, newAttendees);
};

const fetchAllValidEvents = (bucket, srcTokenKeyTpl, tgtTokenKeyTpl, userInfoKeyTpl, users, processedEvents, syncDays) =>
  Promise.all(users.map((user) => {
    const srcTokenKey = fillInUser(srcTokenKeyTpl, user);
    const tgtTokenKey = fillInUser(tgtTokenKeyTpl, user);
    const userInfoKey = fillInUser(userInfoKeyTpl, user);
    return Promise.all([
      readObjectFromS3(bucket, srcTokenKey),
      readObjectFromS3(bucket, tgtTokenKey),
      readObjectFromS3(bucket, userInfoKey),
    ]).then((tokenAndInfo) => {
      const [srcToken, tgtToken, userInfo] = tokenAndInfo;
      return fetchOutlookEvents(srcToken.token.access_token, syncDays)
            .then((events) => {
              const newEvents = events.value.filter(
                message => (processedEvents.findIndex(ele => ele.iCalUId === message.iCalUId
                  && ele.start.dateTime === message.start.dateTime
                  && ele.end.dateTime === message.end.dateTime
                  && ele.isCancelled === message.isCancelled) < 0),
              );
              return {
                validEvents: newEvents.map(ele => ({
                  id: ele.iCalUId,
                  info: userInfo,
                  token: tgtToken,
                  event: ele,
                })),
                allEvents: events.value,
              };
            });
    }).catch(() => ({ validEvents: [], allEvents: processedEvents }));
  })).then(events => ({
    validEvents: _.uniqBy(_.flatMap(events, ele => ele.validEvents), ele => ele.id),
    allEvents: _.uniqBy(_.flatMap(events, ele => ele.allEvents), ele => ele.iCalUId),
  }));

const sendEmail = (server, options) => new Promise((resolve, reject) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // use SSL
    auth: server,
  });
  transporter.sendMail(options, (error, info) => {
    if (error) {
      reject(error);
    } else {
      resolve(info);
    }
  });
});

const sendNoRoomEmail = (server, event, allAttendees) => {
  const validAttendees = mapAttendees(allAttendees, event.attendees);
  const targetEmails = validAttendees.reduce((acc, item) => `${item.email},${acc}`, '');
  const options = {
    from: server.user,
    to: targetEmails,
    subject: `Failed to book meeting <${event.subject}> from ${event.start.dateTime} to ${event.end.dateTime}`,
    html: `<html><body>${event.bodyPreview}</body></html>`,
  };
  return sendEmail(server, options);
};

const recordCreatedEvent = (bucket, createdEventKey, processedEvents, googleEvents) => {
  const createdEvents = googleEvents.filter(googleEvent =>
    processedEvents.findIndex((processedEvent => processedEvent.iCalUId === googleEvent.outlookEventId)) >= 0)
  return writeObjectToS3(bucket, createdEventKey, createdEvents);
};

const processCreateMessage = (server, message, attendees) =>
    getAvailableRoom(message.info.rooms,
      message.event.start,
      message.event.end,
      message.token.token.access_token,
    )
    .then(room =>
      createGoogleEvent(
        convertOutlookToGoogle(attendees, message.event, room),
        message.token.token.access_token,
      ).then(response =>
        ([{ outlookEventId: message.event.iCalUId, user: message.info.name, googleEventId: response.id }])),
    )
    .catch(() => {
      sendNoRoomEmail(server, message.event, attendees)
        .catch((err) => {
          console.log('Fialed to send email');
          console.log(server);
          console.log(message.event);
          console.log(err);
        }).finally(() => []);
    });

const processAllValidEvents = (bucket, tgtTokenKeyTpl, createdEventsKey, processedEventsKey, totalEvents, attendeesKeyTpl, server) =>
  writeObjectToS3(bucket, processedEventsKey, totalEvents.allEvents)
    .then(() => {
      const createdEvents = readObjectFromS3(bucket, createdEventsKey).catch(() => []);
      const deleteOperation = Promise.all(totalEvents.validEvents
        .filter(event => event.ele.isCancelled && createdEvents.findIndex(createdEvent => event.id === createdEvent.outlookEventId) >= 0)
        .map(event =>
          readObjectFromS3(bucket, fillInUser(tgtTokenKeyTpl, event.info.name))
            .then(tgtToken => deleteGoogleEvent(createdEvents.find(e => e.outlookEventId === event.id).googleEventId, tgtToken))));
      const createOperation = Promise.all(
        totalEvents.validEvents.filter(event => !event.ele.isCancelled).map(event =>
        readObjectFromS3(bucket, fillInUser(attendeesKeyTpl, event.info.name))
          .catch(() => Promise.resolve([]))
          .then(attendees =>
            processCreateMessage(server, event, attendees))))
        .then(processedGoogleEvents => recordCreatedEvent(bucket, createdEventsKey, totalEvents.allEvents, processedGoogleEvents.flat(1)));
      return deleteOperation.then(() => createOperation);
    });

const syncEvents = (bucket,
  processedEventsKey,
  userHomeKey,
  userInfoKeyTpl,
  srcTokenKeyTpl,
  tgtTokenKeyTpl,
  syncDays,
  attendeesKeyTpl,
  createdEventsKey,
  emailServer) => Promise.all([
    listFoldersInS3(bucket, userHomeKey),
    readObjectFromS3(bucket, processedEventsKey).catch(() => Promise.resolve([])),
  ]).then((userAndEvent) => {
    const [users, processedEvents] = userAndEvent;
    return fetchAllValidEvents(
      bucket,
      srcTokenKeyTpl,
      tgtTokenKeyTpl,
      userInfoKeyTpl,
      users,
      processedEvents,
      syncDays);
  }).then(events =>
    processAllValidEvents(bucket, processedEventsKey, events, attendeesKeyTpl, createdEventsKey, emailServer));

const refreshTokens = (bucket, userHomeKey, clientKeyTpl, tokenKeyTpl) => listFoldersInS3(bucket, userHomeKey)
    .then(users => Promise.all(users.map((user) => {
      const clientKey = fillInUser(clientKeyTpl, user);
      const tokenKey = fillInUser(tokenKeyTpl, user);
      console.log(`user is ${user}`);
      console.log(`client key is ${clientKey}`);
      console.log(`token key is ${tokenKey}`);
      return Promise.all([
        readObjectFromS3(bucket, clientKey),
        readObjectFromS3(bucket, tokenKey),
      ]).then((data) => {
        const [client, token] = data;
        console.log('The client is');
        console.log(client);
        console.log('The token is');
        console.log(token);
        return refreshAccessToken(oauth.create(client), token.token.refresh_token)
        .then(newToken => writeObjectToS3(bucket, tokenKey, newToken));
      });
    })));

const authorize = (user, bucket, clientKeyTpl, tokenKeyTpl, code, redirectUrl, scope) => {
  const clientKey = fillInUser(clientKeyTpl, user);
  const tokenKey = fillInUser(tokenKeyTpl, user);
  return readObjectFromS3(bucket, clientKey).then(client => getTokenFromCode(
      oauth.create(client),
      code,
      redirectUrl,
      scope.replace(/,/g, ' '),
    ).then(token => writeObjectToS3(bucket, tokenKey, token)));
};

const getLoginUrl = (user, bucket, clientKeyTpl, redirectUrl, scope) => {
  const clientKey = fillInUser(clientKeyTpl, user);
  return readObjectFromS3(bucket, clientKey).then(client => getAuthUrl(oauth.create(client),
      redirectUrl,
      scope.replace(/,/g, ' '),
      user));
};

const getUserInfo = (user,
  bucket,
  userInfoKeyTpl,
  googleTokenKeyTpl,
  outlookTokenKeyTpl,
  attendeesKeyTpl,
  googleLoginUrl,
  outlookLoginUrl) => {
  const userInfoKey = fillInUser(userInfoKeyTpl, user);
  const attendeesKey = fillInUser(attendeesKeyTpl, user);
  const googleTokenKey = fillInUser(googleTokenKeyTpl, user);
  const outlookTokenKey = fillInUser(outlookTokenKeyTpl, user);

  return Promise.all([
    objectExistInS3(bucket, googleTokenKey),
    objectExistInS3(bucket, outlookTokenKey),
    readObjectFromS3(bucket, userInfoKey),
    readObjectFromS3(bucket, attendeesKey).catch(() => []),
  ]).then((data) => {
    const [googleIsAvailable, outlookIsAvailable, info, attendees] = data;
    return {
      info,
      googleIsAvailable,
      outlookIsAvailable,
      googleLoginUrl,
      outlookLoginUrl,
      attendees,
    };
  });
};

export { fetchOutlookEvents,
  convertOutlookToGoogle,
  createGoogleEvent,
  getAvailableRoom,
  readObjectFromS3,
  writeObjectToS3,
  listFoldersInS3,
  addUser,
  updateAttendees,
  syncEvents,
  refreshTokens,
  authorize,
  getLoginUrl,
  fillInUser,
  getUserInfo,
  saveUserBasicInfo,
  mapAttendees,
};
